import { default as Router } from "@koa/router";
import { StatusCodes } from "http-status-codes";
import * as Schema from "io-ts";
import { WebSocket } from "ws";

import { Games, Notifications, Users } from "../../public.js";
import { requireUrlParameter, Validation } from "../../util/validation.js";
import { WebError } from "../errors.js";
import type { Server } from "../model.js";
import { requireSession } from "./auth.js";
import { body } from "./util.js";

const PermissionsBody = Schema.readonly(
  Schema.partial({
    game: Games.Slug,
    manageGames: Schema.boolean,
    managePermissions: Schema.boolean,
    manageGacha: Schema.boolean,
    manageBets: Schema.boolean,
  }),
);

export const usersApi = (server: Server.State): Router => {
  const router = new Router();

  // Get Logged In User.
  router.get("/", (ctx) => {
    const sessionCookie = requireSession(ctx.cookies);
    ctx.redirect(`/api/user/${sessionCookie.user}`);
    ctx.status = StatusCodes.TEMPORARY_REDIRECT;
  });

  // Search for users.
  router.get("/search", async (ctx) => {
    const query = ctx.query["q"];
    if (query === undefined) {
      throw new WebError(StatusCodes.BAD_REQUEST, "Must provide query.");
    }
    if (typeof query !== "string") {
      throw new WebError(StatusCodes.BAD_REQUEST, "Must provide single query.");
    }
    if (query.length < 2) {
      throw new WebError(StatusCodes.BAD_REQUEST, "Query too short.");
    }
    const summaries = await server.store.searchUsers(query);
    ctx.body = Schema.readonlyArray(
      Schema.tuple([Users.Slug, Users.Summary]),
    ).encode(summaries.map(Users.summaryFromInternal));
  });

  // Get User.
  router.get("/:userSlug", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const internalUser = await server.store.getUser(userSlug);
    if (internalUser === undefined) {
      throw new WebError(StatusCodes.NOT_FOUND, "User not found.");
    }
    ctx.body = Schema.tuple([Users.Slug, Users.User]).encode(
      Users.fromInternal(internalUser),
    );
  });

  // Get User Bets.
  router.get("/:userSlug/bets", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const games = await server.store.getUserBets(userSlug);
    ctx.body = Schema.readonlyArray(
      Schema.tuple([Games.Slug, Games.WithBets]),
    ).encode(games.map(Games.withBetsFromInternal));
  });

  // Get User Notifications.
  router.get("/:userSlug/notifications", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const sessionCookie = requireSession(ctx.cookies);
    if (sessionCookie.user !== userSlug) {
      throw new WebError(
        StatusCodes.NOT_FOUND,
        "Can't get other user's notifications.",
      );
    }

    // If we have a web-socket, the client requested an upgrade to one,
    // so we should do that, otherwise we fall back to just a standard
    // one-time reply.
    const ws: unknown = ctx["ws"];
    if (ws instanceof Function) {
      const socket = (await ws()) as WebSocket;
      const userId = await server.store.validateSession(
        sessionCookie.user,
        sessionCookie.session,
      );
      await server.webSockets.attach(server, userId, sessionCookie, socket);
    } else {
      const notifications = await server.store.getNotifications(
        sessionCookie.user,
        sessionCookie.session,
      );
      ctx.body = Schema.readonlyArray(Notifications.Notification).encode(
        notifications.map(Notifications.fromInternal),
      );
    }
  });

  // Clear User Notification.
  router.post("/:userSlug/notifications/:notificationId", body, async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const notificationId = Validation.requireNumberUrlParameter(
      Notifications.Id,
      "notification",
      ctx.params["notificationId"],
    );
    const sessionCookie = requireSession(ctx.cookies);
    if (sessionCookie.user !== userSlug) {
      throw new WebError(
        StatusCodes.NOT_FOUND,
        "Can't delete other user's notifications.",
      );
    }
    await server.store.clearNotification(
      sessionCookie.user,
      sessionCookie.session,
      notificationId,
    );
    ctx.body = Notifications.Id.encode(notificationId);
  });

  router.get("/:userSlug/bankrupt", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    ctx.body = Users.BankruptcyStats.encode(
      Users.bankruptcyStatsFromInternal(
        await server.store.bankruptcyStats(userSlug),
      ),
    );
  });

  // Bankrupt User.
  router.post("/:userSlug/bankrupt", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const sessionCookie = requireSession(ctx.cookies);
    if (sessionCookie.user !== userSlug) {
      throw new WebError(
        StatusCodes.NOT_FOUND,
        "You can't make other players bankrupt.",
      );
    }
    const internalUser = await server.store.bankrupt(
      sessionCookie.user,
      sessionCookie.session,
    );
    ctx.body = Schema.tuple([Users.Slug, Users.User]).encode(
      Users.fromInternal(internalUser),
    );
  });

  // Get User Permissions.
  router.get("/:userSlug/permissions", async (ctx) => {
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const permissions = await server.store.getPermissions(userSlug);
    ctx.body = Users.EditablePermissions.encode(
      Users.editablePermissionsFromInternal(permissions),
    );
  });

  // Set User Permissions.
  router.post("/:userSlug/permissions", body, async (ctx) => {
    const sessionCookie = requireSession(ctx.cookies);
    const userSlug = requireUrlParameter(
      Users.Slug,
      "user",
      ctx.params["userSlug"],
    );
    const body = Validation.body(PermissionsBody, ctx.request.body);
    const permissions = await server.store.setPermissions(
      sessionCookie.user,
      sessionCookie.session,
      userSlug,
      body.game,
      body.manageGames,
      body.managePermissions,
      body.manageGacha,
      body.manageBets,
    );
    ctx.body = Users.EditablePermissions.encode(
      Users.editablePermissionsFromInternal(permissions),
    );
  });

  return router;
};
