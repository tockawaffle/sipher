"use client"

import AppSidebar from "@/components/home";
import OlmSetupDialog from "@/components/olm/olm-setup-dialog";
import { MainContentLayout } from "@/components/ui/layout";
import { Spinner } from "@/components/ui/spinner";
import UserFloatingCard from "@/components/ui/user/floating-card";
import { useOlmSetup } from "@/hooks/use-olm-setup";
import { useSocket } from "@/hooks/use-socket";
import { authClient } from "@/lib/auth/client";
import { getRandomPhrase, type PhrasePreference } from "@/lib/constants/phrases";
import { useMutation, useQuery } from "convex/react";
import { redirect, useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { api } from "../../convex/_generated/api";

export default function AppContainer() {
	const pathname = usePathname();
	const params = useParams();

	// Detect route type and extract params from URL
	const routeInfo = useMemo(() => {
		if (pathname.startsWith('/channels/me/')) {
			return {
				type: 'dm' as const,
				// Decode URL-encoded params (dm%3A... becomes dm:...)
				dmChannelId: params.id ? decodeURIComponent(params.id as string) : undefined
			};
		}
		if (pathname.startsWith('/channels/servers/')) {
			return {
				type: 'server' as const,
				serverId: params.serverId ? decodeURIComponent(params.serverId as string) : undefined,
				serverChannelId: params.channelId ? decodeURIComponent(params.channelId as string) : undefined
			};
		}
		return { type: 'home' as const };
	}, [pathname, params]);
	const { data, error, isPending, refetch } = authClient.useSession();

	const hasServerOlm = useQuery(
		api.auth.retrieveServerOlmAccount,
		data?.user?.id ? { userId: data.user.id } : "skip"
	);

	const userStatus = useQuery(api.auth.getUserStatus);
	const { socketStatus, socketInfo, disconnect, connect } = useSocket({
		user: {
			id: data?.user?.id,
			status: userStatus ? {
				status: userStatus.status,
				isUserSet: userStatus.isUserSet,
			} : {
				status: "offline" as const,
				isUserSet: false,
			},
		},
		refetchUser: refetch
	});

	const sendKeysToServer = useMutation(api.auth.sendKeysToServer);
	const updateUserMetadata = useMutation(api.auth.updateUserMetadata);

	useEffect(() => {
		if (!data) return;
		const metadata = data.user.metadata
		if (!metadata) {
			console.debug("[AppContainer] > User metadata set", data.user.metadata)
			updateUserMetadata({ metadata: { phrasePreference: "comforting" } });
		}
	}, [data, updateUserMetadata]);

	const { olmStatus, showOlmModal, setShowOlmModal, handleCreateAccount } = useOlmSetup({
		userId: data?.user?.id,
		hasServerOlm,
		sendKeysToServer
	});

	const getPhrase = useCallback(() => {
		const preference = data?.user?.metadata?.phrasePreference as PhrasePreference | undefined;
		return getRandomPhrase(preference);
	}, [data?.user?.metadata?.phrasePreference]);

	if (isPending) {
		return (
			<div className="flex items-center justify-center h-screen w-full bg-background">
				<Spinner className="size-10 animate-spin" />
			</div>
		);
	}

	if (error || !data) {
		return redirect(`/auth${error ? `?error=${error.cause}` : "?error=no-data"}`);
	}

	if (["connecting", "error", "disconnected"].includes(socketStatus)) {
		return (
			<div className="flex items-center justify-center h-screen w-full bg-background">
				<Spinner className="size-10 animate-spin" />
			</div>
		);
	}

	return (
		<>
			<UserFloatingCard user={data.user} />
			<AppSidebar
				socketStatus={socketStatus}
				socketInfo={socketInfo}
				disconnectSocket={disconnect}
				connectSocket={connect}
			>
				<MainContentLayout
					socketStatus={socketStatus}
					emptyChannelMessage={getPhrase()}
					emptyFriendsMessage={getPhrase()}
					userId={data.user.id}
					dmChannelId={routeInfo.type === 'dm' ? routeInfo.dmChannelId : undefined}
					serverId={routeInfo.type === 'server' ? routeInfo.serverId : undefined}
					serverChannelId={routeInfo.type === 'server' ? routeInfo.serverChannelId : undefined}
				/>
			</AppSidebar>

			<OlmSetupDialog
				open={showOlmModal}
				onOpenChange={setShowOlmModal}
				olmStatus={olmStatus}
				onCreateAccount={handleCreateAccount}
			/>
		</>
	);
}

