declare global {
	namespace SiPher {

		interface AppSidebarProps {
			children: React.ReactNode;
			socketStatus: SocketStatus;
			socketInfo: SocketInfo;
			currentChannel?: SiPher.Channel;
			disconnectSocket: () => void;
			connectSocket: () => void;
		}

		interface SidebarItem {
			id: string;
			icon: React.ReactNode;
			label: string;
		}

		type OlmStatus = "checking" | "synced" | "mismatched" | "not_setup" | "creating";
		type SocketStatus = "connecting" | "connected" | "error" | "disconnected";

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

