import { default as Discord, TextChannel } from "discord.js";

import { Iterables } from "../util/iterables.js";
import type { Config } from "./config.js";
import type { Logging } from "./logging.js";

interface DiscordMessage {
  title: string;
  url: string;
  message: string;
  mentionedUsers?: string[];
}

interface MessagePart {
  title?: string;
  message?: string;
  mentionedUsers?: string[];
}

interface Context {
  target: "message" | "title";
  isPotentialSpoiler: boolean;
}

type DiscordString = Segment | string | Iterable<DiscordString>;

abstract class Segment {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  abstract string(context: Context): MessagePart;
}

class Spoiler extends Segment {
  string(context: Context): MessagePart {
    return {
      [context.target]: context.isPotentialSpoiler
        ? `||${this.value}||`
        : this.value,
    };
  }
}
const spoiler = (name: string) => new Spoiler(name);

class User extends Segment {
  string(context: Context): MessagePart {
    return {
      [context.target]: `<@${this.value}>`,
      mentionedUsers: [this.value],
    };
  }
}
const user = (name: string) => new User(name);

const joinAnd = (
  segments: Iterable<DiscordString>,
  joiner: DiscordString = ", ",
  and: DiscordString = ", and ",
): Iterable<DiscordString> => {
  const segmentList = [...segments];
  if (segmentList.length < 2) {
    return segmentList;
  } else {
    const empty = Array(segmentList.length - 2) as undefined[];
    const joints = [...empty].map(() => joiner);
    joints.push(and);
    return Iterables.interleave(segmentList, joints);
  }
};

const discord = (
  strings: TemplateStringsArray,
  ...segments: DiscordString[]
): Iterable<DiscordString> =>
  Iterables.interleave<DiscordString>(strings, segments);

const flatten = (segments: Iterable<DiscordString>): (Segment | string)[] =>
  [...segments].flatMap((segment) =>
    segment instanceof Segment || typeof segment === "string"
      ? [segment]
      : flatten(segment),
  );

const segmentsToParts = (context: Context, segments: Iterable<DiscordString>) =>
  Iterables.map(flatten(segments), (segment) =>
    segment instanceof Segment
      ? segment.string(context)
      : { [context.target]: segment },
  );

const construct = (
  isPotentialSpoiler: boolean,
  title: Iterable<DiscordString>,
  message: Iterable<DiscordString>,
  url: string,
): DiscordMessage => {
  const context = { isPotentialSpoiler };
  const parts = [
    ...segmentsToParts({ ...context, target: "title" }, title),
    ...segmentsToParts({ ...context, target: "message" }, message),
  ];
  const titleParts = [];
  const messageParts = [];
  const users = [];
  for (const part of parts) {
    if (part.title !== undefined) {
      titleParts.push(part.title);
    }
    if (part.message !== undefined) {
      messageParts.push(part.message);
    }
    if (part.mentionedUsers !== undefined) {
      users.push(...part.mentionedUsers);
    }
  }
  return {
    title: titleParts.join(""),
    url,
    message: messageParts.join(""),
    mentionedUsers: users,
  };
};

export abstract class Notifier implements Notifier {
  abstract notify(
    constructMessage: () => Promise<DiscordMessage>,
  ): Promise<void>;

  public static newBet(
    clientOrigin: string,
    isPotentialSpoiler: boolean,
    gameSlug: string,
    game: string,
    betSlug: string,
    bet: string,
  ): DiscordMessage {
    return construct(
      isPotentialSpoiler,
      discord`Stream Bets—“${spoiler(bet)}” bet for “${game}”.`,
      discord`New bet for the game “${game}”: “${spoiler(bet)}”.`,
      `${clientOrigin}/games/${gameSlug}/${betSlug}`,
    );
  }

  public static newStake(
    clientOrigin: string,
    isPotentialSpoiler: boolean,
    gameSlug: string,
    game: string,
    betSlug: string,
    bet: string,
    option: string,
    owner: string,
    staked: number,
    message: string,
  ): DiscordMessage {
    return construct(
      isPotentialSpoiler,
      discord`Stream Bets—“${spoiler(bet)}” bet for “${game}”.`,
      discord`Big bet of ${staked.toString()} on “${spoiler(
        option,
      )}” in the bet “${spoiler(bet)}” for the game “${game}”.\n\n${user(
        owner,
      )}: “${spoiler(message)}”.`,
      `${clientOrigin}/games/${gameSlug}/${betSlug}`,
    );
  }

  public static betComplete(
    clientOrigin: string,
    isPotentialSpoiler: boolean,
    gameSlug: string,
    game: string,
    betSlug: string,
    bet: string,
    winners: string[],
    winningBets: number,
    totalReturn: number,
    highlightedWinners: string[],
    biggestPayout: number,
  ): DiscordMessage {
    const otherWinnerCount = winningBets - highlightedWinners.length;
    const others =
      otherWinnerCount > 0
        ? ` They and ${otherWinnerCount} others share a total of ${totalReturn} in winnings.`
        : "";
    const winningUsers = joinAnd(highlightedWinners.map(user));
    const winInfo =
      winningBets > 0
        ? discord`${winningUsers} ${
            highlightedWinners.length > 1 ? "each won" : "won"
          } ${biggestPayout.toString()}!${others}`
        : `No one bet on ${
            winners.length > 1 ? "those options" : "that option"
          }!`;
    const winningOptions = joinAnd(
      winners.map((w) => discord`“${spoiler(w)}”`),
    );
    return construct(
      isPotentialSpoiler,
      discord`Stream Bets—“${spoiler(bet)}” bet for “${game}”.`,
      discord`The bet “${spoiler(
        bet,
      )}” for the game “${game}” has been resolved—${winningOptions} won!\n\n${winInfo}`,
      `${clientOrigin}/games/${gameSlug}/${betSlug}`,
    );
  }
}

export class NullNotifier extends Notifier {
  async notify(
    _constructMessage: () => Promise<DiscordMessage>,
  ): Promise<void> {
    // Do Nothing.
  }
}

export class DiscordNotifier extends Notifier {
  generalConfig: Config.Server;
  config: Config.DiscordNotifier;
  client: Discord.Client;

  private constructor(
    generalConfig: Config.Server,
    config: Config.DiscordNotifier,
  ) {
    super();
    this.generalConfig = generalConfig;
    this.config = config;
    const intents = new Discord.IntentsBitField();
    this.client = new Discord.Client({ intents });
  }

  static async create(
    logger: Logging.Logger,
    generalConfig: Config.Server,
    config: Config.DiscordNotifier,
  ): Promise<Notifier> {
    const instance = new this(generalConfig, config);
    try {
      await instance.login();
    } catch (error) {
      logger.error(
        "Failure while setting up notifier, reverting to null notifier.",
        { exception: error },
      );
      return new NullNotifier();
    }
    return instance;
  }

  async login(): Promise<void> {
    await this.client.login(this.config.token.value);
  }

  async notify(constructMessage: () => Promise<DiscordMessage>): Promise<void> {
    const { title, url, message, mentionedUsers } = await constructMessage();
    const channel = (await this.client.channels.fetch(
      this.config.channel,
    )) as TextChannel;
    await channel.send({
      embeds: [
        {
          title,
          description: message,
          url,
          thumbnail: {
            url: `${this.generalConfig.clientOrigin}/assets/images/favicon-48x48.png`,
          },
        },
      ],
      tts: false,
      allowedMentions:
        mentionedUsers === undefined
          ? { parse: [] }
          : {
              parse: ["users"],
              users: mentionedUsers,
            },
    });
  }
}
