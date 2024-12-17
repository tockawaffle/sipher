declare global {
	namespace SiPher {
		type Thread = {
			thread_id: string;
			participants: string[];
			participant_suuids: string[];
			messages: {
				isSender: boolean;
				id: string;  // UUID
				content: string;  // The encrypted content (either sender_content or recipient_content)
				sender_uuid: string;  // UUID of sender
				created_at: string;  // ISO timestamp
			}[];
		}
		
		type User = {
			created_at: string
			indexable: boolean | null
			public_key: Json | null
			requests: string[] | null
			suuid: string
			username: string
			uuid: string
		}
		
		interface DecryptedMessage {
			id: string;
			content: string;
			sender_uuid: string;
			created_at: string;
			isSender: boolean;
			error?: boolean;
		}
		
		interface RealtimeMessageData {
			created_at: string;
			id: string;
			recipient_content: string;
			sender_content: string;
			sender_uuid: string;
			thread_id: string;
		}
	}
}

export {}