module JoeBets.Theme exposing
    ( Theme(..)
    , all
    , decoder
    , encode
    , fromString
    , selectItem
    , toClass
    , toString
    )

import FontAwesome as Icon
import FontAwesome.Solid as Icon
import Html
import Html.Attributes as HtmlA
import Json.Decode as JsonD
import Json.Encode as JsonE
import Material.Select as Select
import Util.Json.Decode as JsonD


type Theme
    = Auto
    | Dark
    | Light


all : List Theme
all =
    [ Auto, Dark, Light ]


toString : Theme -> String
toString theme =
    case theme of
        Auto ->
            "auto"

        Dark ->
            "dark"

        Light ->
            "light"


toClass : Theme -> Html.Attribute msg
toClass theme =
    (toString theme ++ "-theme") |> HtmlA.class


encode : Theme -> JsonE.Value
encode =
    toString >> JsonE.string


fromString : String -> Maybe Theme
fromString string =
    case string of
        "dark" ->
            Just Dark

        "light" ->
            Just Light

        "auto" ->
            Just Auto

        _ ->
            Nothing


decoder : JsonD.Decoder Theme
decoder =
    let
        fromStringJson string =
            string
                |> fromString
                |> Maybe.map JsonD.succeed
                |> Maybe.withDefault (JsonD.unknownValue "theme" string)
    in
    JsonD.string |> JsonD.andThen fromStringJson


selectItem : Theme -> Theme -> Select.Option msg
selectItem selected theme =
    let
        ( icon, name, description ) =
            case theme of
                Auto ->
                    ( Icon.adjust, "Auto", "Automatically choose theme based on system settings." )

                Dark ->
                    ( Icon.moon, "Dark", "Light text on a dark background." )

                Light ->
                    ( Icon.sun, "Light", "Dark text on a light background." )
    in
    Select.option name (selected == theme) (toString theme)
        |> Select.icon (Icon.view icon)
        |> Select.optionSupportingText description True
