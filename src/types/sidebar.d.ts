
declare global {
	namespace SiPher {

		interface AppSidebarProps {
			children: React.ReactNode;
			socketStatus: SocketStatus;
			socketInfo: SocketInfo;
			currentChannel?: SiPher.Channel;
			disconnectSocket: () => void;
			connectSocket: () => void;
			routeInfo: RouteInfo;
		}

		type PageTypes = "friends" | "support" | "dm" | "server" | "nests" | "discover" | "global-nests";

		type RouteInfo = {
			type: PageTypes;
		} | {
			type: PageTypes.dm;
			dmChannelId: string;
		} | {
			type: PageTypes.server;
			serverId: string;
			serverChannelId: string;
		} | {
			type: PageTypes.nests;
			serverId: string;
			serverChannelId: string;
		} | {
			type: PageTypes.discover;
		} | {
			type: PageTypes.support;
		}

		interface SidebarItem {
			id: string;
			icon: React.ReactNode;
			label: string;
			href?: string;
		}

		type OlmStatus = "checking" | "synced" | "mismatched" | "not_setup" | "creating";
		type SocketStatus = "connecting" | "connected" | "error" | "disconnected" | "manually_disconnected";

		interface SocketInfo {
			ping: number | null;
			transport: string | null;
			connectedAt: number | null;
			socketId: string | null;
			serverUrl: string | null;
			error: string | null;
		}
	}
}
export { };

