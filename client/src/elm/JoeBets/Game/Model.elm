module JoeBets.Game.Model exposing
    ( Game
    , Progress(..)
    , WithBets
    , decoder
    , finish
    , start
    , withBetsDecoder
    )

import AssocList
import JoeBets.Bet.Model as Bet exposing (Bet)
import JoeBets.Bet.Option exposing (Option)
import JoeBets.Game.Progress as Progress
import JoeBets.User.Model as User
import Json.Decode as JsonD
import Json.Decode.Pipeline as JsonD
import Time.Date exposing (Date)
import Time.DateTime as DateTime exposing (DateTime)
import Util.Json.Decode as JsonD


type Progress
    = Future Progress.Future
    | Current Progress.Current
    | Finished Progress.Finished


start : Progress -> Maybe Date
start progress =
    case progress of
        Future _ ->
            Nothing

        Current current ->
            Just current.start

        Finished finished ->
            Just finished.start


finish : Progress -> Maybe Date
finish progress =
    case progress of
        Future _ ->
            Nothing

        Current _ ->
            Nothing

        Finished finished ->
            Just finished.finish


progressDecoder : JsonD.Decoder Progress
progressDecoder =
    let
        byName name =
            case name of
                "Future" ->
                    Progress.futureDecoder |> JsonD.map Future

                "Current" ->
                    Progress.currentDecoder |> JsonD.map Current

                "Finished" ->
                    Progress.finishedDecoder |> JsonD.map Finished

                _ ->
                    JsonD.unknownValue "game progress" name
    in
    JsonD.field "state" JsonD.string |> JsonD.andThen byName


type alias Game =
    { name : String
    , cover : String
    , progress : Progress
    , order : Maybe Int
    , bets : Int
    , staked : Int
    , managers : AssocList.Dict User.Id User.Summary

    -- Metadata
    , version : Int
    , created : DateTime
    , modified : DateTime
    }


baseDecoder : JsonD.Decoder Int -> JsonD.Decoder Int -> JsonD.Decoder Game
baseDecoder bets staked =
    JsonD.succeed
        Game
        |> JsonD.required "name" JsonD.string
        |> JsonD.required "cover" JsonD.string
        |> JsonD.required "progress" progressDecoder
        |> JsonD.optionalAsMaybe "order" JsonD.int
        |> JsonD.custom bets
        |> JsonD.custom staked
        |> JsonD.required "managers" (JsonD.assocListFromTupleList User.idDecoder User.summaryDecoder)
        |> JsonD.required "version" JsonD.int
        |> JsonD.required "created" DateTime.decoder
        |> JsonD.required "modified" DateTime.decoder


decoder : JsonD.Decoder Game
decoder =
    baseDecoder (JsonD.field "bets" JsonD.int) (JsonD.field "staked" JsonD.int)


type alias WithBets =
    { game : Game
    , bets : AssocList.Dict Bet.Id Bet
    }


withBetsDecoder : JsonD.Decoder WithBets
withBetsDecoder =
    let
        betsDecoder =
            JsonD.assocListFromTupleList Bet.idDecoder Bet.decoder

        getOptionStakes : Option -> List Int
        getOptionStakes option =
            option.stakes |> AssocList.values |> List.map .amount

        getBetStakes : Bet -> List Int
        getBetStakes bet =
            bet.options |> AssocList.values |> List.concatMap getOptionStakes

        gameDecoder : AssocList.Dict Bet.Id Bet -> JsonD.Decoder Game
        gameDecoder bets =
            baseDecoder
                (bets |> AssocList.size |> JsonD.succeed)
                (bets |> AssocList.values |> List.concatMap getBetStakes |> List.sum |> JsonD.succeed)

        fromBets bets =
            JsonD.succeed WithBets
                |> JsonD.custom (gameDecoder bets)
                |> JsonD.hardcoded bets
    in
    JsonD.field "bets" betsDecoder |> JsonD.andThen fromBets
