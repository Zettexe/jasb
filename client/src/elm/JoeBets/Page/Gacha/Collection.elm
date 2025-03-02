module JoeBets.Page.Gacha.Collection exposing
    ( init
    , load
    , manageContext
    , update
    , view
    )

import AssocList
import Browser.Dom as Dom
import DragDrop
import FontAwesome as Icon
import FontAwesome.Solid as Icon
import Html exposing (Html)
import Html.Attributes as HtmlA
import Html.Keyed as HtmlK
import JoeBets.Api as Api
import JoeBets.Api.Action as Api
import JoeBets.Api.Data as Api
import JoeBets.Api.Error as Api
import JoeBets.Api.IdData as Api
import JoeBets.Api.Model as Api
import JoeBets.Api.Path as Api
import JoeBets.Gacha.Balance as Balance
import JoeBets.Gacha.Banner as Banner
import JoeBets.Gacha.Card as Card
import JoeBets.Messages as Global
import JoeBets.Overlay as Overlay
import JoeBets.Page exposing (Page)
import JoeBets.Page.Gacha.Balance as Balance
import JoeBets.Page.Gacha.Banner as Banner
import JoeBets.Page.Gacha.Card as Card
import JoeBets.Page.Gacha.Collection.Model exposing (..)
import JoeBets.Page.Gacha.Collection.Route exposing (..)
import JoeBets.Page.Gacha.DetailedCard as Gacha
import JoeBets.Page.Gacha.Model as Gacha
import JoeBets.Route as Route
import JoeBets.User as User
import JoeBets.User.Auth.Model as Auth
import JoeBets.User.Model as User
import Json.Encode as JsonE
import List.Extra as List
import Material.Button as Button
import Material.IconButton as IconButton
import Platform.Cmd as Cmd
import Task
import Time.Model as Time
import Util.AssocList as AssocList
import Util.Maybe as Maybe


wrap : Msg -> Global.Msg
wrap =
    Global.CollectionMsg


wrapGacha : Gacha.Msg -> Global.Msg
wrapGacha =
    Global.GachaMsg


type alias Parent a =
    { a
        | origin : String
        , time : Time.Context
        , auth : Auth.Model
        , collection : Model
        , gacha : Gacha.Model
    }


init : Model
init =
    { route = Nothing
    , collection = Api.initIdData
    , bannerCollection = Api.initIdData
    , recycleConfirmation = Nothing
    , messageEditor = Nothing
    , orderEditor = DragDrop.init
    , saving = Api.initAction
    , editingHighlights = False
    }


load : User.Id -> Route -> Parent a -> ( Parent a, Cmd Global.Msg )
load id route ({ origin, gacha, collection } as model) =
    let
        ( newCollection, collectionCmd ) =
            { path = Api.UserCards Nothing |> Api.Cards id |> Api.Gacha
            , decoder = collectionDecoder
            , wrap = LoadCollection id >> wrap
            }
                |> Api.get origin
                |> Api.getIdData id collection.collection

        loadBannerCollection bannerId =
            { path = bannerId |> Just |> Api.UserCards |> Api.Cards id |> Api.Gacha
            , decoder = bannerCollectionDecoder
            , wrap = LoadBannerCollection id bannerId >> wrap
            }
                |> Api.get origin
                |> Api.getIdData ( id, bannerId ) collection.bannerCollection

        ( newBannerCollection, newGacha, cmds ) =
            case route of
                Overview ->
                    ( collection.bannerCollection, gacha, Cmd.none )

                Banner bannerId ->
                    let
                        ( loadedCollection, loadedCmd ) =
                            loadBannerCollection bannerId
                    in
                    ( loadedCollection, gacha, loadedCmd )

                Card bannerId cardId ->
                    let
                        ( loadedCollection, loadedCmd ) =
                            loadBannerCollection bannerId

                        ( loadedGacha, gachaCmd ) =
                            Gacha.viewDetailedCard origin
                                { ownerId = id, bannerId = bannerId, cardId = cardId }
                                gacha
                    in
                    ( loadedCollection
                    , loadedGacha
                    , Cmd.batch [ loadedCmd, gachaCmd ]
                    )
    in
    ( { model
        | collection =
            { collection
                | route = Just ( id, route )
                , collection = newCollection
                , bannerCollection = newBannerCollection
            }
        , gacha = newGacha
      }
    , Cmd.batch [ collectionCmd, cmds ]
    )


update : Msg -> Parent a -> ( Parent a, Cmd Global.Msg )
update msg ({ origin, collection } as model) =
    case msg of
        LoadCollection userId response ->
            let
                updatedCollection =
                    collection.collection |> Api.updateIdData userId response
            in
            ( { model
                | collection =
                    { collection | collection = updatedCollection }
              }
            , Cmd.none
            )

        LoadBannerCollection userId bannerId response ->
            let
                updatedCollection =
                    collection.bannerCollection
                        |> Api.updateIdData ( userId, bannerId ) response
            in
            ( { model
                | collection =
                    { collection | bannerCollection = updatedCollection }
              }
            , Cmd.none
            )

        SetEditingHighlights editing ->
            case model.auth.localUser of
                Just { id } ->
                    let
                        revertOrderInCollection c =
                            { c | highlights = c.highlights |> revertOrder }

                        updatedCollection =
                            if not editing then
                                Api.updateIdDataValue id revertOrderInCollection

                            else
                                identity
                    in
                    ( { model
                        | collection =
                            { collection
                                | collection = collection.collection |> updatedCollection
                                , editingHighlights = editing
                            }
                      }
                    , Cmd.none
                    )

                Nothing ->
                    ( model, Cmd.none )

        SetCardHighlighted user banner card highlighted ->
            let
                path =
                    Api.SpecificCard banner card Api.Highlight
                        |> Api.Cards user
                        |> Api.Gacha

                wrapSaved =
                    HighlightSaved user banner card >> wrap

                execute =
                    if highlighted then
                        Api.put model.origin
                            { path = path
                            , body = JsonE.object []
                            , wrap = Result.map Just >> wrapSaved
                            , decoder = Card.highlightedDecoder
                            }

                    else
                        Api.delete model.origin
                            { path = path
                            , wrap = Result.map (\_ -> Nothing) >> wrapSaved
                            , decoder = Card.idDecoder
                            }

                ( saving, cmd ) =
                    execute |> Api.doAction collection.saving
            in
            ( { model | collection = { collection | saving = saving } }
            , cmd
            )

        EditHighlightMessage user _ card message ->
            let
                updateMessageEditor existingEditor givenMessage =
                    case existingEditor of
                        Just editor ->
                            if editor.card == card then
                                { editor | message = givenMessage }

                            else
                                editor

                        Nothing ->
                            { card = card, message = givenMessage }

                updatedCollection =
                    if Api.toMaybeId collection.collection == Just user then
                        { collection | messageEditor = message |> Maybe.map (updateMessageEditor collection.messageEditor) }

                    else
                        collection
            in
            ( { model | collection = updatedCollection }
            , if message == Nothing then
                Cmd.none

              else
                Dom.focus "highlighted-message-editor"
                    |> Task.attempt (\_ -> "Focus highlighted message editor done." |> NoOp |> wrap)
            )

        SetHighlightMessage user banner card message ->
            let
                ( saving, saveCmd ) =
                    { path =
                        Api.SpecificCard banner card Api.Highlight
                            |> Api.Cards user
                            |> Api.Gacha
                    , body =
                        [ ( "message", message |> Maybe.map JsonE.string |> Maybe.withDefault JsonE.null ) ]
                            |> JsonE.object
                    , wrap = Result.map Just >> HighlightSaved user banner card >> wrap
                    , decoder = Card.highlightedDecoder
                    }
                        |> Api.post origin
                        |> Api.doAction collection.saving
            in
            ( { model | collection = { collection | saving = saving } }
            , saveCmd
            )

        HighlightSaved user banner card response ->
            let
                ( maybeUpdatedHighlight, state ) =
                    collection.saving |> Api.handleActionResult response

                updateHighlights c =
                    case maybeUpdatedHighlight of
                        Just updatedHighlight ->
                            let
                                op =
                                    case updatedHighlight of
                                        Just addedOrReplaced ->
                                            replaceOrAddHighlight banner card addedOrReplaced

                                        Nothing ->
                                            removeHighlight card
                            in
                            { c | highlights = op c.highlights }

                        Nothing ->
                            c

                updatedCollection =
                    if Api.toMaybeId collection.collection == Just user then
                        let
                            newCollection =
                                collection.collection
                                    |> Api.updateIdDataValue user updateHighlights
                        in
                        { collection
                            | saving = state
                            , collection = newCollection
                            , messageEditor = Nothing
                        }

                    else
                        collection
            in
            ( { model | collection = updatedCollection }, Cmd.none )

        ReorderHighlights user dragDropMsg ->
            let
                updatedCollection =
                    if Api.toMaybeId collection.collection == Just user then
                        let
                            orderEditor =
                                collection.orderEditor

                            ( newOrderEditor, drop ) =
                                DragDrop.update dragDropMsg orderEditor

                            updateOrder ( cardId, index ) c =
                                let
                                    ( before, after ) =
                                        c.highlights
                                            |> getLocalOrder
                                            |> List.filter ((/=) cardId)
                                            |> List.splitAt index

                                    newOrder =
                                        List.concat [ before, [ cardId ], after ]
                                in
                                { c | highlights = c.highlights |> reorder newOrder }

                            updateIfDropped =
                                case drop of
                                    Just dropped ->
                                        Api.updateIdDataValue user (updateOrder dropped)

                                    Nothing ->
                                        identity
                        in
                        { collection
                            | orderEditor = newOrderEditor
                            , collection = collection.collection |> updateIfDropped
                        }

                    else
                        collection
            in
            ( { model | collection = updatedCollection }, Cmd.none )

        SaveHighlightOrder user cardOrder maybeResult ->
            case maybeResult of
                Nothing ->
                    let
                        ( saving, saveOrderCmd ) =
                            { path = Api.Highlights |> Api.Cards user |> Api.Gacha
                            , body = cardOrder |> JsonE.list Card.encodeId
                            , wrap = Just >> SaveHighlightOrder user cardOrder >> wrap
                            , decoder = Card.highlightsDecoder
                            }
                                |> Api.post origin
                                |> Api.doAction collection.saving
                    in
                    ( { model | collection = { collection | saving = saving } }
                    , saveOrderCmd
                    )

                Just result ->
                    let
                        ( maybeUpdatedHighlights, state ) =
                            collection.saving |> Api.handleActionResult result

                        replaceCollection newHighlights existing =
                            { existing | highlights = localOrderHighlights newHighlights }

                        ( withUpdatedHighlights, editingHighlights ) =
                            case maybeUpdatedHighlights of
                                Just newHighlights ->
                                    ( Api.updateIdDataValue user (replaceCollection newHighlights)
                                    , False
                                    )

                                Nothing ->
                                    ( identity, collection.editingHighlights )
                    in
                    ( { model
                        | collection =
                            { collection
                                | collection = collection.collection |> withUpdatedHighlights
                                , saving = state
                                , editingHighlights = editingHighlights
                            }
                      }
                    , Cmd.none
                    )

        RecycleCard user banner card process ->
            let
                gacha =
                    model.gacha

                ( updatedGacha, updatedCollection, actionCmd ) =
                    case process of
                        AskConfirmRecycle ->
                            let
                                ( value, getValue ) =
                                    { path =
                                        Api.RecycleValue
                                            |> Api.SpecificCard banner card
                                            |> Api.Cards user
                                            |> Api.Gacha
                                    , wrap = GetRecycleValue >> RecycleCard user banner card >> wrap
                                    , decoder = Balance.valueDecoder
                                    }
                                        |> Api.get origin
                                        |> Api.initGetData
                            in
                            ( gacha
                            , { collection
                                | recycleConfirmation =
                                    Just
                                        { banner = banner
                                        , card = card
                                        , value = value
                                        }
                              }
                            , getValue
                            )

                        GetRecycleValue response ->
                            let
                                updateExisting existing =
                                    if existing.banner == banner && existing.card == card then
                                        { existing | value = existing.value |> Api.updateData response }

                                    else
                                        existing
                            in
                            ( gacha
                            , { collection
                                | recycleConfirmation =
                                    collection.recycleConfirmation |> Maybe.map updateExisting
                              }
                            , Cmd.none
                            )

                        ExecuteRecycle ->
                            let
                                ( saving, cmd ) =
                                    { path =
                                        Api.SpecificCard banner card Api.Card
                                            |> Api.Cards user
                                            |> Api.Gacha
                                    , wrap = Recycled >> RecycleCard user banner card >> wrap
                                    , decoder = Balance.decoder
                                    }
                                        |> Api.delete origin
                                        |> Api.doAction collection.saving
                            in
                            ( gacha
                            , { collection | saving = saving }
                            , cmd
                            )

                        CancelRecycle ->
                            ( gacha
                            , { collection | recycleConfirmation = Nothing }
                            , Cmd.none
                            )

                        Recycled response ->
                            let
                                -- Ignored because we use updateData lower down.
                                ( _, saving ) =
                                    collection.saving
                                        |> Api.handleActionResult response

                                updateCards _ ct =
                                    { ct | cards = ct.cards |> AssocList.remove card }

                                updateCardTypes bannerCollection =
                                    { bannerCollection
                                        | cardTypes =
                                            bannerCollection.cardTypes
                                                |> AssocList.map updateCards
                                    }

                                updateConfirmationAndCards =
                                    { collection
                                        | bannerCollection =
                                            collection.bannerCollection
                                                |> Api.updateIdDataValue ( user, banner ) updateCardTypes
                                        , recycleConfirmation = Nothing
                                    }
                            in
                            ( { gacha
                                | balance = gacha.balance |> Api.updateData response
                                , detailedCard = Api.initIdData
                              }
                            , { updateConfirmationAndCards | saving = saving }
                            , Cmd.none
                            )
            in
            ( { model
                | collection = updatedCollection
                , gacha = updatedGacha
              }
            , actionCmd
            )

        NoOp _ ->
            ( model, Cmd.none )


manageContext : Auth.Model -> Model -> Maybe ManageContext
manageContext auth { orderEditor, collection } =
    let
        contextFor ( id, { highlights } ) localUser =
            if id == localUser.id then
                Just
                    { orderEditor = orderEditor
                    , highlighted =
                        highlights
                            |> getHighlights
                            |> AssocList.keySet
                    }

            else
                Nothing
    in
    Maybe.map2 contextFor
        (Api.idDataToMaybe collection)
        auth.localUser
        |> Maybe.andThen identity


viewHighlights : Maybe ManageContext -> Maybe (User.Id -> Banner.Id -> Card.Id -> Global.Msg) -> Model -> Collection -> List (Html Global.Msg)
viewHighlights maybeContext onClick model collection =
    let
        order =
            collection.highlights |> getLocalOrder

        highlights =
            collection.highlights |> getHighlights

        ( description, manageOrView ) =
            if model.editingHighlights then
                ( [ Html.p [] [ Html.text "Drag and drop cards to reorder them." ] ]
                , Card.Manage maybeContext
                )

            else
                ( [], Card.View onClick )

        cards =
            if AssocList.size highlights > 0 then
                let
                    viewHighlight =
                        Card.viewHighlight manageOrView
                            model
                            collection.user.id
                            collection.highlights

                    fromId id =
                        AssocList.get id highlights |> Maybe.map (Tuple.pair id)
                in
                order
                    |> List.filterMap fromId
                    |> List.indexedMap viewHighlight
                    |> HtmlK.ol [ HtmlA.class "cards" ]

            else
                Html.p [ HtmlA.class "empty" ]
                    [ Icon.ghost |> Icon.view
                    , Html.text "This user has not showcased any cards."
                    ]

        ( saveOrder, editButton ) =
            case maybeContext of
                Just _ ->
                    let
                        orderChanged =
                            isOrderChanged collection.highlights

                        startEditingHighlights =
                            SetEditingHighlights (not model.editingHighlights)
                                |> wrap
                                |> Maybe.whenNot (model.editingHighlights && orderChanged)
                    in
                    ( if model.editingHighlights then
                        let
                            saveAction =
                                SaveHighlightOrder collection.user.id order Nothing
                                    |> wrap
                                    |> Maybe.when orderChanged
                        in
                        [ Html.div [ HtmlA.class "controls" ]
                            [ Button.text "Cancel"
                                |> Button.button (SetEditingHighlights False |> wrap |> Just |> Api.ifNotWorking model.saving)
                                |> Button.icon (Icon.undo |> Icon.view)
                                |> Button.view
                            , Button.filled "Save Order"
                                |> Button.button (saveAction |> Api.ifNotWorking model.saving)
                                |> Button.icon (Icon.save |> Icon.view |> Api.orSpinner model.saving)
                                |> Button.view
                            ]
                        ]

                      else
                        []
                    , [ IconButton.icon (Icon.view Icon.edit)
                            "Edit"
                            |> IconButton.button startEditingHighlights
                            |> IconButton.view
                      ]
                    )

                _ ->
                    ( [], [] )
    in
    [ [ [ Html.div [ HtmlA.class "header" ]
            (Html.h3 [] [ Html.text "Showcased Cards" ] :: editButton)
        ]
      , description
      , model.saving
            |> Api.toMaybeError
            |> Maybe.map (\e -> [ Api.viewError e ])
            |> Maybe.withDefault []
      , [ cards ]
      , saveOrder
      ]
        |> List.concat
        |> Html.div [ HtmlA.class "highlights" ]
    ]


view : Parent a -> Page Global.Msg
view parent =
    let
        titleFromDataInternal target ( id, { user } ) =
            if id == target then
                user.user.name ++ "'s Cards" |> Just

            else
                Nothing

        titleFromData target =
            Api.idDataToMaybe >> Maybe.andThen (titleFromDataInternal target)

        maybeContext =
            manageContext parent.auth parent.collection

        confirmRecycle userId =
            case parent.collection.recycleConfirmation of
                Just { banner, card, value } ->
                    let
                        saving =
                            parent.collection.saving

                        cancel =
                            RecycleCard userId banner card CancelRecycle |> wrap

                        viewedValue =
                            value
                                |> Api.dataToMaybe
                                |> Maybe.map Balance.viewValue
                                |> Maybe.withDefault (Html.text "scrap proportional to the rarity")
                    in
                    [ Overlay.viewLevel 1
                        cancel
                        [ [ [ Html.p []
                                [ Html.text "Are you sure you want to recycle this card? "
                                , Html.text "There is no way to undo this, it will be gone forever. "
                                , Html.text "You will get "
                                , viewedValue
                                , Html.text " for recycling the card."
                                ]
                            ]
                          , Api.viewAction [] saving
                          , [ Html.div [ HtmlA.class "controls" ]
                                [ Html.span [ HtmlA.class "cancel" ]
                                    [ Button.text "Cancel"
                                        |> Button.button (cancel |> Just)
                                        |> Button.icon (Icon.times |> Icon.view)
                                        |> Button.view
                                    ]
                                , Button.filled "Recycle"
                                    |> Button.button (RecycleCard userId banner card ExecuteRecycle |> wrap |> Just |> Api.ifNotWorking saving)
                                    |> Button.icon (Icon.recycle |> Icon.view)
                                    |> Button.view
                                ]
                            ]
                          ]
                            |> List.concat
                            |> Html.div [ HtmlA.id "confirm-recycle" ]
                        ]
                    ]

                Nothing ->
                    []

        viewDetailedCard ownerId bannerId card =
            Gacha.ViewDetailedCard
                { ownerId = ownerId, bannerId = bannerId, cardId = card }
                Api.Start
                |> wrapGacha

        viewCollection : Model -> User.Id -> Collection -> List (Html Global.Msg)
        viewCollection model userId collection =
            let
                { user } =
                    collection.user
            in
            [ [ User.viewLink User.Full userId user ]
            , viewHighlights maybeContext (viewDetailedCard |> Just) model collection
            , [ Html.h3 [] [ Html.text "Cards by Banner" ]
              , Banner.viewCollectionBanners collection.user.id collection.banners
              ]
            , confirmRecycle userId
            , Card.viewDetailedCardOverlay maybeContext parent.gacha
            , Card.viewDetailedCardTypeOverlay parent.gacha
            ]
                |> List.concat

        viewBannerCollection _ bannerCollection =
            let
                userId =
                    bannerCollection.user.id

                { user } =
                    bannerCollection.user

                ( bannerId, banner ) =
                    bannerCollection.banner

                viewDetailedCardType givenBannerId cardTypeId =
                    Gacha.ViewDetailedCardType
                        { bannerId = givenBannerId, cardTypeId = cardTypeId }
                        Api.Start
                        |> wrapGacha

                onClick =
                    { placeholder = viewDetailedCardType
                    , card = viewDetailedCard
                    }
                        |> Just
            in
            [ [ User.viewLink User.Full userId user
              , Route.a (Overview |> Route.CardCollection userId) [] [ Html.text "Back to Collection" ]
              , Banner.viewCollectionBanner False userId bannerId banner
              , Card.viewCardTypesWithCards onClick False userId bannerId bannerCollection.cardTypes
              ]
            , Card.viewDetailedCardOverlay maybeContext parent.gacha
            , Card.viewDetailedCardTypeOverlay parent.gacha
            , confirmRecycle userId
            ]
                |> List.concat

        viewBannerPart userId bannerId _ =
            let
                id =
                    ( userId, bannerId )

                data =
                    parent.collection.bannerCollection
            in
            ( titleFromData id data
            , Api.viewSpecificIdData Api.viewOrError
                viewBannerCollection
                id
                data
            )

        ( title, contents ) =
            case parent.collection.route of
                Nothing ->
                    ( Nothing, [] )

                Just ( userId, Overview ) ->
                    let
                        data =
                            parent.collection.collection
                    in
                    ( titleFromData userId data
                    , Api.viewSpecificIdData Api.viewOrError
                        (viewCollection parent.collection)
                        userId
                        data
                    )

                Just ( userId, Banner bannerId ) ->
                    viewBannerPart userId bannerId Nothing

                Just ( userId, Card bannerId cardId ) ->
                    viewBannerPart userId bannerId (Just cardId)

        titleOrDefault =
            title |> Maybe.withDefault "Card Collection"
    in
    { title = titleOrDefault
    , id = "card-collection"
    , body =
        [ [ Html.h2 [] [ Html.text titleOrDefault ] ]
        , contents
        ]
            |> List.concat
    }
