import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  isPrivate: boolean("is_private").default(false),
  postPropagationPolicy: text("post_propagation_policy").default("all"),
});

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    content: jsonb("content").notNull(),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    federatedAuthorId: text("federated_author_id"),
    published: timestamp("published").notNull(),
    isLocal: boolean("is_local").default(false).notNull(),
    isPrivate: boolean("is_private").default(false),
    createdAt: timestamp("created_at").notNull(),
    federationUrl: text("federation_url"),
    federationPostId: text("federation_post_id"),
  },
  (table) => [
    index("posts_federationUrl_idx").on(table.federationUrl),
    index("posts_federationPostId_idx").on(table.federationPostId),
  ],
);

export const follows = pgTable(
  "follows",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id").notNull(),
    followingId: text("following_id").notNull(),
    accepted: boolean("accepted").default(false).notNull(),
    createdAt: timestamp("created_at").notNull(),
    followerServerUrl: text("follower_server_url").references(
      () => serverRegistry.url,
      { onDelete: "cascade" },
    ),
    followingServerUrl: text("following_server_url").references(
      () => serverRegistry.url,
      { onDelete: "cascade" },
    ),
  },
  (table) => [
    index("follows_followerServerUrl_idx").on(table.followerServerUrl),
    index("follows_followingServerUrl_idx").on(table.followingServerUrl),
  ],
);

export const deliveryJobs = pgTable("delivery_jobs", {
  id: text("id").primaryKey(),
  targetUrl: text("target_url").notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptedAt: timestamp("last_attempted_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  createdAt: timestamp("created_at").notNull(),
});

export const mutes = pgTable("mutes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mutedUserId: text("muted_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
});

export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  blockedUserId: text("blocked_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
});

export const serverRegistry = pgTable(
  "server_registry",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    publicKey: text("public_key").notNull().unique(),
    encryptionPublicKey: text("encryption_public_key").notNull().unique(),
    lastSeen: timestamp("last_seen").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    isHealthy: boolean("is_healthy").notNull(),
    healthCheckAttempts: integer("health_check_attempts").default(0).notNull(),
    unhealthyReason: text("unhealthy_reason"),
  },
  (table) => [
    uniqueIndex("serverRegistry_publicKey_uidx").on(table.publicKey),
    uniqueIndex("serverRegistry_encryptionPublicKey_uidx").on(
      table.encryptionPublicKey,
    ),
    index("serverRegistry_lastSeen_idx").on(table.lastSeen),
  ],
);

export const rotateChallengeTokens = pgTable(
  "rotate_challenge_tokens",
  {
    id: text("id").primaryKey(),
    signingOldToken: text("signing_old_token").notNull(),
    signingNewToken: text("signing_new_token").notNull(),
    encryptionOldToken: text("encryption_old_token").notNull(),
    encryptionNewToken: text("encryption_new_token").notNull(),
    newSigningPublicKey: text("new_signing_public_key").notNull(),
    newEncryptionPublicKey: text("new_encryption_public_key").notNull(),
    serverUrl: text("server_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
    attemptsLeft: integer("attempts_left").default(3).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("rotateChallengeTokens_serverUrl_idx").on(table.serverUrl)],
);

export const blacklistedServers = pgTable(
  "blacklisted_servers",
  {
    id: text("id").primaryKey(),
    serverUrl: text("server_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [index("blacklistedServers_serverUrl_idx").on(table.serverUrl)],
);

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  twoFactors: many(twoFactor),
  postss: many(posts),
  mutess: many(mutes),
  blockss: many(blocks),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(user, {
    fields: [posts.authorId],
    references: [user.id],
  }),
}));

export const followsFollowerServerUrlRelations = relations(
  follows,
  ({ one }) => ({
    serverRegistry: one(serverRegistry, {
      fields: [follows.followerServerUrl],
      references: [serverRegistry.url],
    }),
  }),
);

export const followsFollowingServerUrlRelations = relations(
  follows,
  ({ one }) => ({
    serverRegistry: one(serverRegistry, {
      fields: [follows.followingServerUrl],
      references: [serverRegistry.url],
    }),
  }),
);

export const mutesUserIdRelations = relations(mutes, ({ one }) => ({
  user: one(user, {
    fields: [mutes.userId],
    references: [user.id],
  }),
}));

export const mutesMutedUserIdRelations = relations(mutes, ({ one }) => ({
  user: one(user, {
    fields: [mutes.mutedUserId],
    references: [user.id],
  }),
}));

export const blocksBlockerIdRelations = relations(blocks, ({ one }) => ({
  user: one(user, {
    fields: [blocks.blockerId],
    references: [user.id],
  }),
}));

export const blocksBlockedUserIdRelations = relations(blocks, ({ one }) => ({
  user: one(user, {
    fields: [blocks.blockedUserId],
    references: [user.id],
  }),
}));

export const serverRegistryRelations = relations(
  serverRegistry,
  ({ many }) => ({
    followss: many(follows),
  }),
);
