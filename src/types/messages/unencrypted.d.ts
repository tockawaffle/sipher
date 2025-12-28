import type { Collection, Doc } from "convex/server";
import type { DMChannel, GlobalChannel, GuildChannel, RegionalChannel } from "./channels";

declare global {
	declare namespace SiPher.Messages.ServerEncrypted {
		type DBMessageType = Doc<"messages">;
		type DBAttachmentType = Doc<"attachments">;
		type ServerEncryptedMessage = Omit<DBMessageType, "authorId" | "channelId" | "guildId"> & {
			author: SipherUser,
			channel: GuildChannel | RegionalChannel | GlobalChannel | DMChannel,
			guild: Server | null,
			attachments: Collection<string, DBAttachmentType>,
		}

		type ServerEncryptedMessageEvent = {
			message: DBMessageType,
			from: SipherUser,
			recipient: MessageRecipient
		}
	}

}
export { };

