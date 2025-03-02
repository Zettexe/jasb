import { default as Slonik } from "slonik";
import { z } from "zod";

import {
  AvatarCache,
  Bets,
  ExternalNotifier,
  Feed,
  Gacha,
  Games,
  Notifications,
  Stakes,
  Users,
} from "../../internal.js";

const sqlFragment = Slonik.sql.fragment;

const typedSql = Slonik.createSqlTag({
  typeAliases: {
    ids: z.object({ id: z.number().int() }),
    count: z.object({ affected: z.number().int().nonnegative() }),
    boolean: z
      .object({
        result: z.boolean(),
      })
      .strict(),
    user_id: z
      .object({
        user_id: z.number().int().nonnegative(),
      })
      .strict(),
    user: Users.User,
    user_summary: Users.Summary,
    user_forge_detail: Users.ForgeDetail,
    session: Users.LoginDetail,
    leaderboard: Users.Leaderboard,
    bankruptcy_stats: Users.BankruptcyStats,
    notification: Notifications.Notification,
    access_token: Users.DiscordAccessToken,
    game_with_bet_stats: Games.Game.merge(Games.BetStats),
    bet_with_options: Bets.Bet.merge(Bets.WithOptions),
    lock_moment: Bets.LockMoment,
    lock_status: Bets.LockStatus,
    game_with_bets: Games.Game.merge(Games.WithBets),
    editable_bet: Bets.Editable,
    bet_complete: ExternalNotifier.BetComplete,
    new_balance: Stakes.NewBalance,
    new_stake: ExternalNotifier.NewStake,
    feed_item: Feed.Item,
    editable_permissions: Users.EditablePermissions,
    avatar_meta: AvatarCache.Meta,
    balance: Gacha.Balances.Balance,
    gacha_value: Gacha.Balances.Value,
    banner: Gacha.Banners.Banner,
    editable_banner: Gacha.Banners.Editable,
    detailed_card_type: Gacha.CardTypes.Detailed,
    editable_card_type: Gacha.CardTypes.Editable,
    card_type: Gacha.CardType,
    card_type_with_cards: Gacha.CardTypes.WithCards,
    rarity_with_optional_card_type: Gacha.CardTypes.OptionalForRarity,
    card: Gacha.Cards.Card,
    detailed_card: Gacha.Cards.Detailed,
    highlighted: Gacha.Cards.Highlighted,
    rarity: Gacha.Rarities.Rarity,
  },
}).typeAlias;

export const ids = (source: Slonik.SqlFragment) => {
  const sql = typedSql("ids");
  return sql`${source}`;
};

export const user = (userSource: Slonik.SqlFragment) => {
  const sql = typedSql("user");
  return sql`
    WITH
      users AS (${userSource})
    SELECT
      users.slug,
      users.name,
      users.discriminator,
      users.created,
      users.balance,
      avatars.url AS avatar_url,
      stakes.staked,
      (stakes.staked + users.balance) AS net_worth,
      coalesce(bool_or(general_permissions.manage_games), FALSE) AS manage_games,
      coalesce(bool_or(general_permissions.manage_permissions), FALSE) AS manage_permissions,
      coalesce(bool_or(general_permissions.manage_gacha), FALSE) AS manage_gacha,
      coalesce(
        jsonb_agg(games.slug) FILTER (WHERE perm.game IS NOT NULL), 
        '[]'::jsonb
      ) AS manage_bets
    FROM
      users INNER JOIN 
      jasb.avatars ON users.avatar = avatars.id INNER JOIN
      jasb.user_stakes AS stakes ON users.id = stakes.user_id LEFT JOIN
      jasb.general_permissions ON users.id = general_permissions."user" LEFT JOIN (
        jasb.per_game_permissions AS perm INNER JOIN 
        jasb.games ON perm.game = games.id
      ) ON users.id = perm."user" AND perm.manage_bets
    GROUP BY (
      users.slug,
      users.name,
      users.discriminator,
      users.balance,
      avatars.url,
      users.created,
      stakes.staked
    )
  `;
};

export const userSummary = (
  userSource: Slonik.SqlFragment,
  order?: Slonik.SqlFragment,
) => {
  const sql = typedSql("user_summary");
  return sql`
    WITH
      users AS (${userSource})
    SELECT
      users.slug,
      users.name,
      users.discriminator,
      avatars.url AS avatar_url
    FROM
      users INNER JOIN jasb.avatars ON users.avatar = avatars.id
    ${order ?? sqlFragment``}
  `;
};

export const userForgeDetail = (userSource: Slonik.SqlFragment) => {
  const sql = typedSql("user_forge_detail");
  return sql`
    WITH
      users AS (${userSource})
    SELECT
      users.name,
      discord_avatar_url(
        users.discord_id, 
        users.discriminator, 
        avatars.hash
      ) AS image
    FROM
      users INNER JOIN jasb.avatars ON users.avatar = avatars.id
  `;
};

export const editableBet = (betsSource: Slonik.SqlFragment) => {
  const sql = typedSql("editable_bet");
  return sql`
    WITH
      bets AS (${betsSource})
    SELECT
      bets.slug,
      bets.name,
      bets.description,
      bets.spoiler,
      lock_moments.slug AS lock_moment_slug,
      lock_moments.name AS lock_moment_name,
      bets.progress,
      bets.resolved,
      bets.cancelled_reason,
      coalesce(options.options, '[]'::jsonb) AS options,
      users.slug AS author_slug,
      users.name AS author_name,
      users.discriminator AS author_discriminator,
      avatars.url AS author_avatar_url,
      bets.version,
      bets.created,
      bets.modified
    FROM (
      bets INNER JOIN 
      jasb.lock_moments ON bets.lock_moment = lock_moments.id INNER JOIN
      jasb.users ON bets.author = users.id INNER JOIN
      jasb.avatars ON users.avatar = avatars.id
    ) LEFT JOIN 
      jasb.editable_options_by_bet AS options ON bets.id = options.bet
  `;
};

export const betWithOptions = (betsSource: Slonik.SqlFragment) => {
  const sql = typedSql("bet_with_options");
  return sql`
    WITH
      bets AS (${betsSource})
    SELECT
      bets.slug,
      bets.name,
      bets.description,
      bets.spoiler,
      lock_moments.slug AS lock_moment_slug,
      lock_moments.name AS lock_moment_name,
      bets.progress,
      bets.cancelled_reason,
      bets.resolved,
      coalesce(options.options, '[]'::jsonb) AS options
    FROM
      bets INNER JOIN
      jasb.lock_moments ON bets.lock_moment = lock_moments.id LEFT JOIN
      jasb.options_by_bet AS options ON bets.id = options.bet
    ORDER BY lock_moments."order", bets.created
  `;
};

export const lockStatus = (betsSource: Slonik.SqlFragment) => {
  const sql = typedSql("lock_status");
  return sql`
    WITH
      bets AS (${betsSource})
    SELECT
      bets.slug AS bet_slug,
      bets.name AS bet_name,
      bets.version AS bet_version,
      lock_moments.slug AS lock_moment_slug,
      (bets.progress = 'Locked'::BetProgress) AS locked
    FROM
      bets INNER JOIN
      jasb.lock_moments ON bets.lock_moment = lock_moments.id
    WHERE
      bets.progress IN (
        'Voting'::BetProgress, 
        'Locked'::BetProgress
      )
    ORDER BY bets.created
  `;
};

export const leaderboard = (leaderboardSource: Slonik.SqlFragment) => {
  const sql = typedSql("leaderboard");
  return sql`
    WITH
      leaderboard AS (${leaderboardSource})
    SELECT
      slug,
      name,
      discriminator,
      created,
      balance,
      avatar_url,
      staked,
      net_worth,
      rank
    FROM
      leaderboard
    ORDER BY rank
    LIMIT 100
  `;
};

export const notification = (notificationSource: Slonik.SqlFragment) => {
  const sql = typedSql("notification");
  return sql`
    WITH
      notifications AS (${notificationSource})
    SELECT
      id,
      notification
    FROM notifications
    ORDER BY notifications.happened DESC
  `;
};

export const session = (sessionSource: Slonik.SqlFragment) => {
  const sql = typedSql("session");
  return sql`
    WITH
      sessions AS (${sessionSource})
    SELECT 
      "user", 
      session, 
      started
    FROM sessions
  `;
};

export const gameWithBetStats = (
  gameSource: Slonik.SqlFragment,
  sort: Slonik.SqlFragment = sqlFragment``,
) => {
  const sql = typedSql("game_with_bet_stats");
  return sql`
    WITH
      games AS (${gameSource})
    SELECT 
      games.slug,
      games.name,
      games.cover,
      games.started,
      games.finished,
      games."order",
      games.version,
      games.created,
      games.modified,
      games.progress,
      coalesce(bets.bet_count, 0) AS bets,
      coalesce(stakes.total_staked_amount, 0) AS staked,
      coalesce(managers.users, '[]'::jsonb) AS managers
    FROM 
      games LEFT JOIN 
      jasb.game_bet_stats AS bets ON games.id = bets.game_id LEFT JOIN 
      jasb.game_stake_stats AS stakes ON games.id = stakes.game_id LEFT JOIN 
      jasb.bet_managers AS managers ON games.id = managers.game_id
    ${sort}
  `;
};

export const gameWithBets = (betsSource: Slonik.SqlFragment) => {
  const sql = typedSql("game_with_bets");
  return sql`
    WITH
      bets AS (${betsSource}),
      game_bets AS (
        SELECT
          bets.game,
          bets.game_order,
          jsonb_build_object(
            'slug', bets.slug,
            'name', bets.name,
            'description', bets.description,
            'spoiler', bets.spoiler,
            'lock_moment_slug', lock_moments.slug,
            'lock_moment_name', lock_moments.name,
            'progress', bets.progress,
            'cancelled_reason', bets.cancelled_reason,
            'resolved', bets.resolved,
            'options', options.options
          ) AS bet
        FROM
          bets INNER JOIN
          jasb.lock_moments ON bets.lock_moment = lock_moments.id LEFT JOIN
          jasb.options_by_bet AS options ON options.bet = bets.id
        GROUP BY (
          bets.game,
          bets.game_order,
          bets.slug,
          bets.name,
          bets.description,
          bets.spoiler,
          lock_moments.slug, 
          lock_moments.name,
          bets.progress,
          bets.cancelled_reason,
          bets.resolved, 
          options.options
        )
      )
      SELECT
        games.slug,
        games.name,
        games.cover,
        games.started,
        games.finished,
        games.progress,
        games.order,
        coalesce(managers.users, '[]'::jsonb) AS managers,
        games.version,
        games.created,
        games.modified,
        coalesce(
          jsonb_agg(
            game_bets.bet ORDER BY game_bets.game_order DESC
          ) FILTER ( WHERE game_bets.bet IS NOT NULL ), 
          '[]'::jsonb
        ) AS bets
      FROM
        game_bets INNER JOIN
        jasb.games ON game_bets.game = games.id LEFT JOIN
        jasb.bet_managers AS managers ON games.id = managers.game_id
      GROUP BY (
        games.slug,
        games.name,
        games.cover,
        games.started,
        games.finished,
        games.progress,
        games.order,
        games.version,
        games.created,
        games.modified,
        managers.users
      )
      ORDER BY max(game_bets.game_order) DESC
    `;
};

export const lockMoment = (lockMomentSource: Slonik.SqlFragment) => {
  const sql = typedSql("lock_moment");
  return sql`
    WITH
      lock_moments AS (${lockMomentSource})
    SELECT
      lock_moments.slug,
      lock_moments.name,
      lock_moments.order,
      count(bets.id) AS bet_count,
      lock_moments.version,
      lock_moments.created,
      lock_moments.modified
    FROM
      lock_moments LEFT JOIN
      jasb.bets ON bets.lock_moment = lock_moments.id
    GROUP BY (
      lock_moments.slug, 
      lock_moments.name, 
      lock_moments.order, 
      lock_moments.version,
      lock_moments.created,
      lock_moments.modified
    )
    ORDER BY lock_moments.order
  `;
};

export const newBalance = (newBalanceSource: Slonik.SqlFragment) => {
  const sql = typedSql("new_balance");
  return sql`SELECT (${newBalanceSource}) AS new_balance`;
};

export const feedItem = (feedItemSource: Slonik.SqlFragment) => {
  const sql = typedSql("feed_item");
  return sql`
    WITH
      feed AS (${feedItemSource})
    SELECT 
      item, 
      time 
    FROM feed
    ORDER BY time DESC 
    LIMIT 100
  `;
};

export const editablePermissions = (userSource: Slonik.SqlFragment) => {
  const sql = typedSql("editable_permissions");
  return sql`
    WITH
      users AS (${userSource})
    SELECT
      coalesce(bool_or(general_permissions.manage_games), FALSE) AS manage_games,
      coalesce(bool_or(general_permissions.manage_permissions), FALSE) AS manage_permissions,
      coalesce(bool_or(general_permissions.manage_gacha), FALSE) AS manage_gacha,
      coalesce(bool_or(general_permissions.manage_bets), FALSE) AS manage_bets,
      coalesce(jsonb_agg(jsonb_build_object(
        'game_slug', games.slug,
        'game_name', games.name,
        'manage_bets', coalesce(specific_permissions.manage_bets, FALSE)
      )) FILTER ( WHERE games.id IS NOT NULL ), '[]'::jsonb) AS game_specific
    FROM
      (users CROSS JOIN jasb.games) LEFT JOIN
      jasb.general_permissions ON users.id = general_permissions."user" LEFT JOIN
      jasb.specific_permissions ON 
        specific_permissions.game = games.id AND 
        users.id = specific_permissions."user"
    GROUP BY users.id
  `;
};

export const count = (countSource: Slonik.SqlFragment) => {
  const sql = typedSql("count");
  return sql`
    WITH
      to_count AS (${countSource})
    SELECT count(*) AS affected
    FROM to_count
  `;
};

export const isTrue = (resultSource: Slonik.SqlFragment) => {
  const sql = typedSql("boolean");
  return sql`SELECT (${resultSource}) AS result`;
};

export const userId = (userSource: Slonik.SqlFragment) => {
  const sql = typedSql("user_id");
  return sql`SELECT (${userSource}) AS user_id`;
};

export const bankruptcyStats = (
  initialBalance: number,
  userSource: Slonik.SqlFragment,
) => {
  const sql = typedSql("bankruptcy_stats");
  return sql`
    WITH
      users AS (${userSource})
    SELECT
      coalesce(sum(stakes.amount), 0) AS amount_lost,
      coalesce(count(*), 0) AS stakes_lost,
      coalesce(sum(stakes.amount) FILTER (WHERE bets.progress = 'Locked'), 0) AS locked_amount_lost,
      coalesce(count(*) FILTER (WHERE bets.progress = 'Locked'), 0) AS locked_stakes_lost,
      ${initialBalance}::INT AS balance_after
    FROM
      users LEFT JOIN (
        jasb.stakes INNER JOIN 
        jasb.options ON stakes.option = options.id INNER JOIN
        jasb.bets ON options.bet = bets.id AND is_active(bets.progress)
      ) ON users.id = stakes.owner
  `;
};

export const accessToken = (sessionSource: Slonik.SqlFragment) => {
  const sql = typedSql("access_token");
  return sql`
    WITH
      sessions AS (${sessionSource})
    SELECT access_token
    FROM sessions
  `;
};

export const betCompleteNotificationDetails = (
  betSource: Slonik.SqlFragment,
) => {
  const sql = typedSql("bet_complete");
  return sql`
    WITH
      bets AS (${betSource})
    SELECT 
      games.name AS game_name, 
      bets.name AS bet_name,
      bets.spoiler,
      bet_stats.winning_stakes_count,
      bet_stats.total_staked_amount,
      bet_stats.top_winning_discord_ids,
      bet_stats.biggest_payout_amount
    FROM 
      bets INNER JOIN 
      jasb.games ON bets.game = games.id INNER JOIN
      jasb.bet_stats ON bets.id = bet_stats.bet_id    
  `;
};

export const newStakeNotificationDetails = (
  userSlug: string,
  optionsSource: Slonik.SqlFragment,
) => {
  const sql = typedSql("new_stake");
  return sql`
    WITH
      options AS (${optionsSource})
    SELECT 
      users.discord_id AS user_discord_id,
      games.name AS game_name, 
      bets.name AS bet_name,
      bets.spoiler,
      options.name AS option_name 
    FROM 
      jasb.users CROSS JOIN
      jasb.games INNER JOIN 
      jasb.bets ON games.id = bets.game INNER JOIN 
      options ON bets.id = options.bet
    WHERE users.slug = ${userSlug}
  `;
};

export const avatarMeta = (avatarSource: Slonik.SqlFragment) => {
  const sql = typedSql("avatar_meta");
  return sql`
    WITH
      avatars AS (${avatarSource})
    SELECT
      avatars.id,
      avatars.url,
      avatars.discord_user,
      avatars.hash,
      avatars.default_index,
      avatars.cached
    FROM avatars
  `;
};

export const balance = (userSource: Slonik.SqlFragment) => {
  const sql = typedSql("balance");
  return sql`
    WITH
      balance AS (${userSource})
    SELECT
      balance.rolls,
      balance.pity,
      balance.guarantees,
      balance.scrap
    FROM balance
  `;
};

export const recycleValue = (cardSource: Slonik.SqlFragment) => {
  const sql = typedSql("gacha_value");
  return sql`
    WITH
      cards AS (${cardSource})
    SELECT
      NULL AS rolls,
      NULL AS guarantees,
      gacha_rarities.recycle_scrap_value AS scrap
    FROM 
      cards INNER JOIN 
      gacha_card_types ON cards.type = gacha_card_types.id INNER JOIN
      gacha_rarities ON gacha_card_types.rarity = gacha_rarities.id
  `;
};

export const rarity = (raritySource: Slonik.SqlFragment) => {
  const sql = typedSql("rarity");
  return sql`
      WITH
          rarities AS (${raritySource})
      SELECT
          rarities.slug,
          rarities.name
      FROM rarities
      ORDER BY rarities.generation_weight DESC
  `;
};

export const banner = (bannerSource: Slonik.SqlFragment) => {
  const sql = typedSql("banner");
  return sql`
    WITH
      banners AS (${bannerSource})
    SELECT
      banners.slug,
      banners.name,
      banners.description,
      banners.cover,
      banners.active,
      banners.type,
      banners.foreground_color,
      banners.background_color
    FROM banners
    ORDER BY banners.order
  `;
};

export const editableBanner = (bannerSource: Slonik.SqlFragment) => {
  const sql = typedSql("editable_banner");
  return sql`
    WITH
      banners AS (${bannerSource})
    SELECT
      banners.slug,
      banners.name,
      banners.description,
      banners.cover,
      banners.active,
      banners.type,
      banners.foreground_color,
      banners.background_color,
      banners.version,
      banners.created,
      banners.modified
    FROM banners
    ORDER BY banners.order
  `;
};

export const detailedCardType = (cardTypeSource: Slonik.SqlFragment) => {
  const sql = typedSql("detailed_card_type");
  return sql`
    WITH
      card_types AS (${cardTypeSource}),
      credits AS (
        SELECT
          credits.card_type,
          jsonb_agg(jsonb_build_object(
            'reason', credits.reason,
            'user_slug', users.slug,
            'name', coalesce(credits.name, users.name),
            'discriminator', users.discriminator,
            'avatar_url', avatars.url
          )) FILTER ( WHERE credits.id IS NOT NULL ) AS credits
        FROM
          gacha_credits AS credits LEFT JOIN
          users ON credits."user" = users.id LEFT JOIN
          avatars ON users.avatar = avatars.id
        GROUP BY
          credits.card_type
      )
    SELECT
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      card_types.retired,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity,
      coalesce(credits.credits, '[]'::jsonb) AS credits,
      jsonb_build_object(
        'slug', banners.slug,
        'name', banners.name,
        'description', banners.description,
        'cover', banners.cover,
        'active', banners.active,
        'type', banners.type,
        'background_color', banners.background_color,
        'foreground_color', banners.foreground_color
        ) AS banner
    FROM 
      card_types INNER JOIN
      gacha_banners AS banners ON card_types.banner = banners.id INNER JOIN
      gacha_rarities AS rarities ON card_types.rarity = rarities.id LEFT JOIN
      credits ON card_types.id = credits.card_type
    GROUP BY
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      card_types.retired,
      rarities.slug,
      rarities.name,
      credits.credits,
      banners.slug,
      banners.name,
      banners.description,
      banners.cover,
      banners.active,
      banners.type,
      banners.background_color,
      banners.foreground_color
  `;
};

export const editableCardType = (cardTypeSource: Slonik.SqlFragment) => {
  const sql = typedSql("editable_card_type");
  return sql`
    WITH
      card_types AS (${cardTypeSource}),
      credits AS (
        SELECT
          credits.card_type,
          jsonb_agg(jsonb_build_object(
            'id', credits.id,
            'reason', credits.reason,
            'user_slug', users.slug,
            'name', coalesce(credits.name, users.name),
            'discriminator', users.discriminator,
            'avatar_url', avatars.url,
            'version', credits.version,
            'created', credits.created,
            'modified', credits.modified
          )) FILTER ( WHERE credits.id IS NOT NULL ) AS credits
        FROM
          gacha_credits AS credits LEFT JOIN
          users ON credits."user" = users.id LEFT JOIN
          avatars ON users.avatar = avatars.id
        GROUP BY
          credits.card_type
      )
    SELECT
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      card_types.retired,
      rarities.slug AS rarity_slug,
      rarities.name AS rarity_name,
      card_types.version,
      card_types.created,
      card_types.modified,
      coalesce(credits.credits, '[]'::jsonb) AS credits
    FROM 
      card_types INNER JOIN 
      gacha_rarities AS rarities ON card_types.rarity = rarities.id LEFT JOIN
      credits ON card_types.id = credits.card_type
    GROUP BY
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      card_types.retired,
      rarities.slug,
      rarities.name,
      credits.credits,
      card_types.version,
      card_types.created,
      card_types.modified
    ORDER BY 
      card_types.created DESC
  `;
};

export const cardTypeWithCards = (
  cardSource: Slonik.SqlFragment,
  bannerSlug: string,
) => {
  const sql = typedSql("card_type_with_cards");
  return sql`
    WITH
      cards AS (${cardSource}),
      qualities AS (
        SELECT
          card_qualities.card,
            jsonb_agg(jsonb_build_object(
            'slug', qualities.slug,
            'name', qualities.name
          )) FILTER ( WHERE qualities.id IS NOT NULL ) AS qualities
        FROM
          gacha_card_qualities AS card_qualities LEFT JOIN
          gacha_qualities AS qualities ON card_qualities.quality = qualities.id
        GROUP BY
          card_qualities.card
      )
    SELECT
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', cards.id,
        'qualities', coalesce(qualities.qualities, '[]'::jsonb)
      )) FILTER ( WHERE cards.id IS NOT NULL ), '[]'::jsonb) AS cards
    FROM
      gacha_card_types AS card_types INNER JOIN
      jasb.gacha_banners AS banners ON card_types.banner = banners.id INNER JOIN
      gacha_rarities AS rarities ON card_types.rarity = rarities.id LEFT JOIN
      cards ON card_types.id = cards.type LEFT JOIN
      qualities ON cards.id = qualities.card
    WHERE
      banners.slug = ${bannerSlug}
    GROUP BY
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      rarities.slug,
      rarities.name,
      card_types.created,
      card_types.retired
    HAVING (NOT card_types.retired) OR (count(cards.id) > 0)
    ORDER BY
      max(rarities.generation_weight), 
      card_types.created
  `;
};

export const cardType = (cardTypeSource: Slonik.SqlFragment) => {
  const sql = typedSql("card_type");
  return sql`
    WITH
      card_types AS (${cardTypeSource})
    SELECT
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity
    FROM
      gacha_rarities as rarities INNER JOIN
      card_types ON rarities.id = card_types.rarity  
    ORDER BY rarities.generation_weight, card_types.created
  `;
};

export const cardTypeByRarity = (cardTypeSource: Slonik.SqlFragment) => {
  const sql = typedSql("rarity_with_optional_card_type");
  return sql`
    WITH
      card_types AS (${cardTypeSource})
    SELECT
      card_types.id,
      card_types.name,
      card_types.description,
      card_types.image,
      card_types.layout,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity
    FROM
      gacha_rarities as rarities LEFT JOIN
      card_types ON rarities.id = card_types.rarity  
    ORDER BY rarities.generation_weight, card_types.created
  `;
};

export const card = (cardSource: Slonik.SqlFragment, rarestFirst: boolean) => {
  const sql = typedSql("card");
  const order = rarestFirst
    ? sqlFragment`max(rarities.generation_weight), cards.created DESC`
    : sqlFragment`cards.id`;
  return sql`
    WITH
      cards AS (${cardSource}),
      qualities AS (
        SELECT
          card_qualities.card,
          jsonb_agg(jsonb_build_object(
            'slug', qualities.slug,
            'name', qualities.name
          )) FILTER ( WHERE qualities.id IS NOT NULL ) AS qualities
        FROM 
          gacha_card_qualities AS card_qualities LEFT JOIN
          gacha_qualities AS qualities ON card_qualities.quality = qualities.id
        GROUP BY
          card_qualities.card
      )
    SELECT
      cards.id,
      types.name,
      types.description,
      types.image,
      types.layout,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity,
      coalesce(qualities.qualities, '[]'::jsonb) AS qualities
    FROM 
      cards INNER JOIN 
      gacha_card_types AS types ON cards."type" = types.id INNER JOIN  
      gacha_rarities AS rarities ON types.rarity = rarities.id LEFT JOIN
      qualities ON cards.id = qualities.card
    ORDER BY ${order}
  `;
};

export const detailedCard = (cardSource: Slonik.SqlFragment) => {
  const sql = typedSql("detailed_card");
  return sql`
    WITH
      cards AS (${cardSource}),
      qualities AS (
        SELECT
          card_qualities.card,
          jsonb_agg(jsonb_build_object(
            'slug', qualities.slug,
            'description', qualities.description,
            'name', qualities.name
          )) FILTER ( WHERE qualities.id IS NOT NULL ) AS qualities
        FROM 
          gacha_card_qualities AS card_qualities LEFT JOIN
          gacha_qualities AS qualities ON card_qualities.quality = qualities.id
        GROUP BY
          card_qualities.card
      ),
      credits AS (
        SELECT
          credits.card_type,
          jsonb_agg(jsonb_build_object(
            'reason', credits.reason,
            'user_slug', credited_user.slug,
            'name', coalesce(credits.name, credited_user.name),
            'discriminator', credited_user.discriminator,
            'avatar_url', credited_avatar.url
          )) FILTER ( WHERE credits.id IS NOT NULL ) AS credits
        FROM
          gacha_credits AS credits LEFT JOIN
          users AS credited_user ON credits."user" = credited_user.id LEFT JOIN
          avatars AS credited_avatar ON credited_user.avatar = credited_avatar.id
        GROUP BY
          credits.card_type
      )
    SELECT
      cards.id,
      types.name,
      types.description,
      types.image,
      types.layout,
      types.retired,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity,
      coalesce(qualities.qualities, '[]'::jsonb) AS qualities,
      coalesce(credits.credits, '[]'::jsonb) AS credits,
      jsonb_build_object(
        'slug', banners.slug,
        'name', banners.name,
        'description', banners.description,
        'cover', banners.cover,
        'active', banners.active,
        'type', banners.type,
        'background_color', banners.background_color,
        'foreground_color', banners.foreground_color
      ) AS banner
    FROM 
      cards INNER JOIN 
      gacha_card_types AS types ON cards."type" = types.id INNER JOIN  
      gacha_banners AS banners ON types.banner = banners.id INNER JOIN
      gacha_rarities AS rarities ON types.rarity = rarities.id LEFT JOIN
      qualities ON cards.id = qualities.card LEFT JOIN
      credits ON types.id = credits.card_type
  `;
};

export const highlighted = (highlightSource: Slonik.SqlFragment) => {
  const sql = typedSql("highlighted");
  return sql`
    WITH
      highlights AS (${highlightSource}),
      qualities AS (
        SELECT
          card_qualities.card,
            jsonb_agg(jsonb_build_object(
            'slug', qualities.slug,
            'name', qualities.name
          )) FILTER ( WHERE qualities.id IS NOT NULL ) AS qualities
        FROM
          gacha_card_qualities AS card_qualities LEFT JOIN
          gacha_qualities AS qualities ON card_qualities.quality = qualities.id
        GROUP BY
          card_qualities.card
      )
    SELECT
      cards.id,
      types.name,
      types.description,
      types.image,
      types.layout,
      jsonb_build_object(
        'slug', rarities.slug,
        'name', rarities.name
      ) AS rarity,
      coalesce(qualities.qualities, '[]'::jsonb) AS qualities,
      highlights.message,
      banners.slug as banner_slug
    FROM
      highlights INNER JOIN
      gacha_cards AS cards ON highlights.card = cards.id INNER JOIN 
      gacha_card_types AS types ON cards."type" = types.id INNER JOIN
      gacha_banners AS banners ON types.banner = banners.id INNER JOIN  
      gacha_rarities AS rarities ON types.rarity = rarities.id LEFT JOIN
      qualities ON cards.id = qualities.card
    ORDER BY highlights.order
  `;
};

export * as Queries from "./queries.js";
