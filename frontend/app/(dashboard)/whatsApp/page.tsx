"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FaWhatsapp, FaQrcode, FaKey, FaCheckCircle, FaPlug, FaTrash } from "react-icons/fa";
import { io, Socket } from "socket.io-client";
import apiClient from "@/lib/axios";
import Loading from "@/app/components/loading/Loading";

export default function WhatsAppPage() {
    const router = useRouter();
    const socketRef = useRef<Socket | null>(null);

    const [activeMode, setActiveMode] = useState<"qr" | "official">("qr");

    // QR states
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
    const [connectedUser, setConnectedUser] = useState<{ id: string; name: string; number?: string } | null>(null);

    const [booting, setBooting] = useState(true);
    const [waitingForQR, setWaitingForQR] = useState(false);

    const [officialConfig, setOfficialConfig] = useState({
        phoneNumberId: "",
        businessAccountId: "",
        accessToken: "",
    });
    const [isOfficialSaved, setIsOfficialSaved] = useState(false);


    useEffect(() => {
        let cancelled = false;

        async function boot() {
            let existingAccount: any = null;
            try {
                const res = await apiClient.get("/channel-accounts", {
                    params: { provider: "whatsapp" },
                });
                const accounts = res.data?.data || [];
                existingAccount = accounts.find((a: any) => a.status === "connected") || null;
            } catch (err) {
                console.warn("Failed to fetch channel accounts", err);
            }

            let nodeStatus: any = null;
            try {
                const r = await fetch("http://localhost:5001/health");
                nodeStatus = await r.json();
            } catch (err) {
                console.warn("Node gateway unreachable");
            }

            if (cancelled) return;

            if (existingAccount && nodeStatus?.status === "connected") {
                router.replace("/whatsApp/inbox");
                return;
            }

            if (nodeStatus?.status === "connected" && nodeStatus.user && !existingAccount) {
                try {
                    await apiClient.post("/channel-accounts", {
                        provider: "whatsapp",
                        connection_type: "qr",
                        account_name: nodeStatus.user.name || "WhatsApp",
                        account_id: nodeStatus.user.number || nodeStatus.user.id,
                        status: "connected",
                    });
                    router.replace("/whatsApp/inbox");
                    return;
                } catch (err) {
                    console.warn("Auto-save failed", err);
                }
            }

            setBooting(false);
            setWaitingForQR(true);

            const socket = io("http://localhost:5001", {
                transports: ["websocket", "polling"],
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                console.log("✅ Socket connected");
                if (existingAccount?.id) {
                    socket.emit("set-channel-account", existingAccount.id);
                }
                socket.emit("start-qr");
            });

            socket.on("qr", (payload: { qr: string }) => {
                setQrCode(payload.qr);
                setConnectionStatus("connecting");
                setWaitingForQR(false);
            });

            socket.on("status", (payload: { status: "disconnected" | "connecting" | "connected" }) => {
                setConnectionStatus(payload.status);
                if (payload.status === "connected") {
                    setWaitingForQR(false);
                }
                if (payload.status === "disconnected") {
                    setQrCode(null);
                }
            });

            socket.on("user", async (user: { id: string; name: string; number?: string }) => {
                setConnectedUser(user);
                setConnectionStatus("connected");
                setQrCode(null);
                setWaitingForQR(false);

                try {
                    const res = await apiClient.post("/channel-accounts", {
                        provider: "whatsapp",
                        connection_type: "qr",
                        account_name: user.name || "WhatsApp",
                        account_id: user.number || user.id,
                        status: "connected",
                    });
                    const savedId = res.data?.data?.id;
                    if (savedId && socketRef.current) {
                        socketRef.current.emit("set-channel-account", savedId);
                    }
                    setTimeout(() => router.replace("/whatsApp/inbox"), 400);
                } catch (err) {
                    console.error("Save failed", err);
                }
            });

            socket.on("connect_error", (err) => {
                console.error("Socket error:", err.message);
                setWaitingForQR(false);
            });
        }

        boot();

        return () => {
            cancelled = true;
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    // ==================================================
    // 2. Official API Save
    // ==================================================
    const handleSaveOfficialConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await apiClient.post("/channel-accounts", {
                provider: "whatsapp",
                connection_type: "official",
                account_name: "WhatsApp Official API",
                account_id: officialConfig.phoneNumberId,
                status: "connected",
            });
            setIsOfficialSaved(true);
        } catch (err) {
            console.error("Failed to save official config", err);
        }
    };

    // ==================================================
    // 3. RENDER
    // ==================================================
    return (
        <div className="p-3 space-y-6 mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center  p-4 shadow-sm  gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#249D8F]/10 rounded-xl text-[#249D8F]">
                        <FaWhatsapp className="text-3xl" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1D2128]">WhatsApp Integration</h1>
                        <p className="text-sm text-gray-500">
                            Connect your WhatsApp account to start sending and receiving messages.
                        </p>
                    </div>
                </div>

                <div className="flex items-center p-1.5 rounded-xl border ">
                    <button
                        onClick={() => setActiveMode("qr")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeMode === "qr" ? "bg-[#249D8F] text-white shadow-md" : "text-gray-600 hover:text-gray-900"
                            }`}
                    >
                        <FaQrcode /> QR Scan (Web Auto)
                    </button>
                    <button
                        onClick={() => setActiveMode("official")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeMode === "official" ? "bg-[#249D8F] text-white shadow-md" : "text-gray-600 hover:text-gray-900"
                            }`}
                    >
                        <FaKey /> Official Meta API
                    </button>
                </div>
            </div>

            {activeMode === "qr" && (
                <div className=" p-8 rounded-2xl shadow-sm border border-gray-100 min-h-[420px] flex flex-col justify-center items-center text-center">
                    {/* Boot check */}
                    {booting && (
                        <Loading size="lg" text="Checking connection status..." />
                    )}

                    {!booting && waitingForQR && !qrCode && (
                        <Loading size="lg" text="Generating QR Code, please wait..." />
                    )}

                    {!booting && qrCode && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="p-4 bg-white border-2 border-dashed border-[#249D8F] rounded-2xl inline-block shadow-lg">
                                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 mx-auto" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">
                                Open WhatsApp on your phone, go to Linked Devices, and scan this QR code to connect.
                            </p>
                        </div>
                    )}

                    {!booting && connectionStatus === "connected" && (
                        <div className="space-y-4">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl">
                                <FaCheckCircle />
                            </div>
                            <p className="text-lg font-semibold text-gray-800">
                                Connected! Redirecting to Inbox...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {activeMode === "official" && (
                <div className=" p-8 rounded-2xl shadow-sm border border-gray-100">
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div className="flex items-center gap-3  pb-4">
                            <FaKey className="text-2xl text-[#E76F51]" />
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">WhatsApp Official Business Cloud API Setup</h3>
                                <p className="text-xs text-gray-500">Enter credentials from your Meta Developer Dashboard</p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveOfficialConfig} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone Number ID
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. 10928374659201"
                                    value={officialConfig.phoneNumberId}
                                    onChange={(e) =>
                                        setOfficialConfig({
                                            ...officialConfig,
                                            phoneNumberId: e.target.value
                                        })
                                    }
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white/50 focus:bg-surface/20 focus:ring-2 focus:ring-[#249D8F] text-sm outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    WhatsApp Business Account ID
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. 98765432101234"
                                    value={officialConfig.businessAccountId}
                                    onChange={(e) =>
                                        setOfficialConfig({
                                            ...officialConfig,
                                            businessAccountId: e.target.value
                                        })
                                    }
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white/50 focus:bg-surface/20 focus:ring-2 focus:ring-[#249D8F] text-sm outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Permanent Access Token
                                </label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="EAAG..."
                                    value={officialConfig.accessToken}
                                    onChange={(e) =>
                                        setOfficialConfig({
                                            ...officialConfig,
                                            accessToken: e.target.value
                                        })
                                    }
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white/50 focus:bg-surface/20 focus:ring-2 focus:ring-[#249D8F] text-sm outline-none"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 bg-[#249D8F] hover:bg-[#1d8276] text-white rounded-xl font-semibold transition shadow-md"
                            >
                                Save Official API Credentials
                            </button>
                        </form>

                        {isOfficialSaved && (
                            <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-center gap-2">
                                <FaCheckCircle className="text-lg" /> Official API configuration saved successfully.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}