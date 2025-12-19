"use client"
import AppSidebar from "@/components/home";
import OlmSetupDialog from "@/components/olm/olm-setup-dialog";
import { Spinner } from "@/components/ui/spinner";
import UserFloatingCard from "@/components/ui/user/floating-card";
import { authClient } from "@/lib/auth/client";
import { checkOlmStatus as checkOlmStatusUtil, handleOlmAccountCreation } from "@/lib/olm";
import { useMutation, useQuery } from "convex/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "../../convex/_generated/api";

export default function Home() {
	const { data, error, isPending } = authClient.useSession();
	const [socketStatus, setSocketStatus] = useState<SiPher.SocketStatus>("connecting");
	const [socketInfo, setSocketInfo] = useState<SiPher.SocketInfo>({
		ping: null,
		transport: null,
		connectedAt: null,
		socketId: null,
		serverUrl: null,
		error: null
	});
	const [olmStatus, setOlmStatus] = useState<SiPher.OlmStatus>("checking");
	const [showOlmModal, setShowOlmModal] = useState(false);

	const hasServerOlm = useQuery(
		api.auth.retrieveServerOlmAccount,
		data?.user?.id ? { userId: data.user.id } : "skip"
	);

	// Mutation for sending keys to server
	const sendKeysToServer = useMutation(api.auth.sendKeysToServer);

	useEffect(() => {
		if (!data) return;

		const socket: Socket = io({ withCredentials: false });
		let pingInterval: NodeJS.Timeout | null = null;

		// Measure ping latency
		const measurePing = () => {
			const start = Date.now();
			socket.volatile.emit("ping", () => {
				const latency = Date.now() - start;
				setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, ping: latency }));
			});
		};

		socket.on("connect", () => {
			console.log("✅ Connected to socket - Authentication successful!");
			setSocketStatus("connected");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				connectedAt: Date.now(),
				socketId: socket.id || null,
				serverUrl: window.location.origin,
				transport: socket.io.engine?.transport?.name || "unknown",
				error: null
			}));

			// Start ping measurement every 5 seconds
			measurePing();
			pingInterval = setInterval(measurePing, 5000);
		});

		// Update transport when it upgrades (polling -> websocket)
		socket.io.engine?.on("upgrade", (transport) => {
			setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, transport: transport.name }));
		});

		socket.on("connect_error", (err) => {
			console.error("❌ Socket connection error:", err.message);
			setSocketStatus("error");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				error: err.message,
				ping: null,
				connectedAt: null,
				socketId: null
			}));
		});

		socket.on("disconnect", (reason) => {
			console.log("🔌 Disconnected from socket:", reason);
			setSocketStatus("disconnected");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				ping: null,
				connectedAt: null,
				error: reason
			}));
			if (pingInterval) clearInterval(pingInterval);
		});

		// Handle pong response for ping measurement
		socket.on("pong", () => {
			// Handled in measurePing callback
		});

		return () => {
			if (pingInterval) clearInterval(pingInterval);
			socket.disconnect();
		};
	}, [data]);

	useEffect(() => {
		if (!data || hasServerOlm === undefined) return;

		const checkStatus = async () => {
			const status = await checkOlmStatusUtil(data.user.id, hasServerOlm);
			setOlmStatus(status);

			if (status === "not_setup" || status === "mismatched") {
				setShowOlmModal(true);
			}
		};

		checkStatus();
	}, [data, hasServerOlm]);

	async function handleCreateOlmAccount(password: string): Promise<void> {
		if (!data || !password.trim()) return;

		setOlmStatus("creating");
		const success = await handleOlmAccountCreation(
			data.user.id,
			password,
			sendKeysToServer,
			olmStatus === "mismatched"
		);

		if (success) {
			setOlmStatus("synced");
			setShowOlmModal(false);
		} else {
			setOlmStatus("not_setup");
		}
	}

	if (isPending) {
		return <div className="flex items-center justify-center h-screen w-full bg-background">
			<Spinner className="size-10 animate-spin" />
		</div>
	}

	if (error || !data) {
		return redirect(`/auth${error ? `?error=${error.cause}` : "no-data"}`);
	}

	return (
		<>
			<UserFloatingCard user={data.user} />
			<AppSidebar socketStatus={socketStatus} socketInfo={socketInfo}>
				<></>
			</AppSidebar>

			{/* OLM Account Setup/Sync Modal */}
			<OlmSetupDialog
				open={showOlmModal}
				onOpenChange={setShowOlmModal}
				olmStatus={olmStatus}
				onCreateAccount={handleCreateOlmAccount}
			/>
		</>
	)
}