import {Json} from "../../database.types";

declare global {
	namespace SiPher {
		type Messages = {
			thread_id: string;
			participants: string[];
			messages: {
				id: string;
				content: string;
			}[];
			indexable?: boolean;
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
	}
}

export {}