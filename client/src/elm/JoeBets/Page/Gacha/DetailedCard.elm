module JoeBets.Page.Gacha.DetailedCard exposing (viewDetailedCard)

import JoeBets.Api as Api
import JoeBets.Api.IdData as Api
import JoeBets.Api.Model as Api
import JoeBets.Api.Path as Api
import JoeBets.Gacha.Card as Card
import JoeBets.Messages as Global
import JoeBets.Page.Gacha.Model exposing (..)


viewDetailedCard : String -> CardPointer -> Model -> ( Model, Cmd Global.Msg )
viewDetailedCard origin pointer gacha =
    let
        ( card, cmd ) =
            { path =
                Api.Card
                    |> Api.SpecificCard pointer.bannerId pointer.cardId
                    |> Api.Cards pointer.ownerId
                    |> Api.Gacha
            , wrap =
                Api.Finish
                    >> ViewDetailedCard pointer
                    >> Global.GachaMsg
            , decoder = Card.detailedDecoder
            }
                |> Api.get origin
                |> Api.getIdData pointer gacha.detailedCard
    in
    ( { gacha | detailedCard = card }
    , cmd
    )
