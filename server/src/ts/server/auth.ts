import * as Joda from "@js-joda/core";
import { default as DiscordOAuth } from "discord-oauth2";
import { StatusCodes } from "http-status-codes";

import { Store } from "../data/store";
import { Notifications, Users } from "../public";
import { Random } from "../util/random";
import { SecretToken } from "../util/secret-token";
import { Config } from "./config";
import { WebError } from "./errors";

export class Auth {
  static readonly sessionCookieName = "jasb-session";
  static readonly stateCookieName = "jasb-state";

  config: Config.Auth;
  store: Store;
  oauth: DiscordOAuth;

  private constructor(config: Config.Auth, store: Store) {
    this.config = config;
    this.store = store;
    this.oauth = new DiscordOAuth({
      version: "",
      clientId: config.discord.clientId,
      clientSecret: config.discord.clientSecret.value,
    });
  }

  static async init(config: Config.Auth, store: Store): Promise<Auth> {
    return new Auth(config, store);
  }

  async redirect(origin: string): Promise<{ url: string; state: string }> {
    const state = await Random.secureRandomString(24);
    return {
      url: this.oauth.generateAuthUrl({
        scope: this.config.discord.scopes,
        redirectUri: new URL("/auth", origin).toString(),
        state,
        prompt: "consent",
      }),
      state,
    };
  }

  async login(
    origin: string,
    code: string
  ): Promise<{
    user: Users.WithId;
    notifications: Notifications.Notification[];
    isNewUser: boolean;
    session: SecretToken;
    expires: Joda.ZonedDateTime;
  }> {
    const discordToken = await this.oauth.tokenRequest({
      scope: this.config.discord.scopes,
      redirectUri: new URL("/auth", origin).toString(),
      grantType: "authorization_code",
      code,
    });

    const discordUser = await this.oauth.getUser(discordToken.access_token);
    const discordGuilds = await this.oauth.getUserGuilds(
      discordToken.access_token
    );

    const jadsId = this.config.discord.guild;
    const memberOfJads = discordGuilds.some((guild) => guild.id === jadsId);
    if (!memberOfJads) {
      throw new WebError(StatusCodes.FORBIDDEN, "Must be a member of JADS.");
    }

    const login = await this.store.login(
      discordUser.id,
      discordUser.username,
      discordUser.discriminator,
      discordUser.avatar ?? null,
      discordToken.access_token,
      discordToken.refresh_token,
      Joda.Duration.of(discordToken.expires_in, Joda.ChronoUnit.SECONDS)
    );
    const user = Users.fromInternal(login.user);
    const notifications = login.notifications.map(Notifications.fromInternal);
    const session = SecretToken.fromUri(login.user.session);
    if (session === undefined) {
      throw new Error("Invalid secret.");
    }
    return {
      user,
      notifications,
      isNewUser: login.user.is_new_user,
      session,
      expires: login.user.started.plus(this.config.sessionLifetime),
    };
  }

  async logout(userId: string, session: SecretToken): Promise<void> {
    const accessToken = await this.store.logout(userId, session);
    if (accessToken != null) {
      const { clientId, clientSecret } = this.config.discord;
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64"
      );
      await this.oauth.revokeToken(accessToken, credentials);
    }
  }
}
