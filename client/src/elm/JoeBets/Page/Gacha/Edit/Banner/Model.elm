module JoeBets.Page.Gacha.Edit.Banner.Model exposing
    ( Editor
    , Msg(..)
    )

import DragDrop
import JoeBets.Api.Action as Api
import JoeBets.Api.Model as Api
import JoeBets.Editing.Uploader as Uploader exposing (Uploader)
import JoeBets.Gacha.Banner as Banner
import Time.DateTime as Time


type alias Editor =
    { banner : Banner.EditableBanner
    , coverUploader : Uploader
    , background : String
    , foreground : String
    , save : Api.ActionState
    }


type Msg
    = Load (Api.Response Banner.EditableBanners)
    | DragDrop (DragDrop.Msg Banner.Id Int)
    | Reorder (List Banner.Id)
    | Reordered (Api.Response Banner.EditableBanners)
    | Add (Maybe Time.DateTime)
    | Edit Banner.Id
    | Cancel
    | Save (Maybe (Api.Response ( Banner.Id, Banner.EditableBanner )))
    | SetId String
    | SetName String
    | SetDescription String
    | SetCover Uploader.Msg
    | SetActive Bool
    | SetType String
    | SetForeground String
    | SetBackground String
