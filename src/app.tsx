/* src/App.tsx */
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

import EthereumProvider from "@walletconnect/ethereum-provider";
import {
  Address,
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { getAddress } from "viem";
import { bscTestnet, baseSepolia } from "viem/chains";
import { Toaster, toast } from "react-hot-toast";
import {
  FaWallet,
  FaSyncAlt,
  FaYoutube,
  FaExclamationTriangle,
  FaCheckCircle,
  FaCopy,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { FaTelegramPlane, FaGithub, FaTwitter } from "react-icons/fa";
import factoryAbi from "./abis/AfriLanceFactory.json";
import escrowAbi from "./abis/AfriLanceEscrow.json";
import { createClient } from "@supabase/supabase-js";
import { FaXTwitter } from "react-icons/fa6";

// ===== env =====
const env = (import.meta as any).env as Record<string, string>;
const RPC = env.VITE_RPC_URL as string;
const FACTORY = env.VITE_FACTORY as Address;
const USDT = env.VITE_USDT as Address;
const USDC = env.VITE_USDC as Address;
const WC_ID = env.VITE_WC_PROJECT_ID as string;
const WALLET_DEEPLINK = (env.VITE_WALLET_DEEPLINK || "") as string;
const BOT_ORACLE_ADDRESS = import.meta.env.VITE_BOT_ORACLE as Address;
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ──────────────────────────────────────────────
// MULTI-CHAIN CONFIG – expand as we deploy to Base
// ──────────────────────────────────────────────
const CHAIN_CONFIG = {
  [bscTestnet.id]: {
    chainName: "BNB Testnet",
    factory: FACTORY,
    usdt: USDT,
    usdc: USDC,
    oracle: BOT_ORACLE_ADDRESS, // Centralized on BNB for now
    rpc: RPC || "https://bsc-testnet-rpc.publicnode.com",
    explorerTx: (hash: string) => `https://testnet.bscscan.com/tx/${hash}`,
    explorerAddr: (addr: string) =>
      `https://testnet.bscscan.com/address/${addr}`,
  },
  [84532]: {
    // Base Sepolia (Chain ID 84532)
    chainName: "Base Sepolia",
    factory: getAddress("0xf4cf3C25F45Aa66cD7130a98788c907d44855761"),
    usdt: "0xa08C5B0A5F8Daf0E5231cC7EbEF4fD3A65C3D2C5",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    oracle: getAddress("0x0F7fC5E6482f096380db6158f978167b57388deE"), // UMA OO V3 on Base Sepolia
    rpc: "https://sepolia.base.org",
    explorerTx: (hash: string) =>
      `https://base-sepolia.blockscout.com/tx/${hash}`,
    explorerAddr: (addr: string) =>
      `https://base-sepolia.blockscout.com/address/${addr}`,
  },
} as const;

type ChainId = keyof typeof CHAIN_CONFIG;

// ===== minimal ERC20 ABI =====
const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

type Role = "client" | "freelancer" | "oracle" | "unknown" | "unset";

const STATE_LABEL: Record<number, string> = {
  0: "Funding",
  1: "Started",
  2: "Submitted",
  3: "Approved",
  4: "Revised",
  5: "Disputed",
  6: "Resolved",
};

const STEPS = [
  { label: "Funding", state: 0 },
  { label: "Started", state: 1 },
  { label: "Submitted", state: 2 },
  { label: "Revised", state: 4 },
  { label: "Approved", state: 3 },
  { label: "Disputed", state: 5 },
  { label: "Resolved", state: 6 },
];

const BSC_TESTNET_HEX = "0x61"; // 97
const BSC_TESTNET_PARAMS = {
  chainId: BSC_TESTNET_HEX,
  chainName: "BNB Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: [RPC || "https://bsc-testnet-rpc.publicnode.com"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
};

const BASE_MAINNET_HEX = "0x2105"; // 8453 in hex
const BASE_MAINNET_PARAMS = {
  chainId: BASE_MAINNET_HEX,
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://base-sepolia.blockscout.com"],
};

const lower = (x?: string) => (x || "").toLowerCase();
const now = () => BigInt(Math.floor(Date.now() / 1000));
const normalizeChainId = (id: any): string => {
  if (id === null || id === undefined) return "unknown";
  if (typeof id === "string") {
    if (id.startsWith("0x")) return id.toLowerCase();
    const n = Number(id);
    if (!Number.isNaN(n)) return "0x" + n.toString(16);
    return "unknown";
  }
  if (typeof id === "number") return "0x" + id.toString(16);
  return "unknown";
};
const fmtTs = (ts: bigint) => {
  if (!ts || ts === 0n) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
};

const isValidEthereumAddress = (addr: string): addr is Address => {
  const trimmed = addr.trim();
  return /^0x[a-fA-F0-9]{40}$/i.test(trimmed);
};

const normalizeAndValidateCid = (input: string): string | null => {
  if (!input) return null;
  const cleaned = input.trim();

  let cidPart: string;
  if (cleaned.startsWith("ipfs://")) {
    cidPart = cleaned.slice(7);
  } else {
    cidPart = cleaned;
  }

  if (!/^[a-zA-Z0-9]{59}$/.test(cidPart)) {
    return null;
  }

  return `ipfs://${cidPart}`;
};

export default function App() {
  // wallet / providers
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<string>("unknown");
  const [currentChain, setCurrentChain] = useState<
    typeof bscTestnet | typeof baseSepolia
  >(bscTestnet);
  const [showChainMenu, setShowChainMenu] = useState(false);
  const [pub, setPub] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null); // Raw provider (ethereum or WC)
  const [isWalletConnect, setIsWalletConnect] = useState(false);
  const [wc, setWc] = useState<any>(null); // Only for WC
  const [freelancerAddr, setFreelancerAddr] = useState("");
  const [settlementToken, setSettlementToken] = useState<"USDT" | "USDC">(
    "USDT",
  );

  // escrow + ui
  const [escrow, setEscrow] = useState<Address>();
  const [settlement, setSettlement] = useState<"USDT" | "USDC">("USDT");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState<string>("Connect your wallet");

  // on-chain snapshot
  const [role, setRole] = useState<Role>("unset");
  const [escrowClient, setEscrowClient] = useState<Address>();
  const [escrowFreelancer, setEscrowFreelancer] = useState<Address>();
  const [escrowOracle, setEscrowOracle] = useState<Address>();
  const [escrowToken, setEscrowToken] = useState<Address>();
  const [escrowState, setEscrowState] = useState<number | null>(null);

  const isEscrowFinished = useMemo(() => {
    return escrowState === 3 || escrowState === 6;
  }, [escrowState]);

  const [depositAmount, setDepositAmount] = useState<bigint>(0n);
  const [escrowTokenDecimals, setEscrowTokenDecimals] = useState<
    number | undefined
  >(undefined);

  // deadlines & meta
  const [depositDeadline, setDepositDeadline] = useState<bigint>(0n);
  const [startDeadline, setStartDeadline] = useState<bigint>(0n);
  const [completionDeadline, setCompletionDeadline] = useState<bigint>(0n);
  const [revisions, setRevisions] = useState<number>(0);
  const [MAX_REVISIONS, setMAX_REVISIONS] = useState<bigint>(2n);
  const [DISPUTE_GRACE, setDISPUTE_GRACE] = useState<bigint>(
    2n * 24n * 60n * 60n,
  );
  const [disputeStart, setDisputeStart] = useState<bigint>(0n);
  const [FEE, setFEE] = useState<bigint>(0n);
  const [proofHash, setProofHash] = useState<string>("");

  // ===== UMA dispute UX state (Base only) =====
  const [disputeAssertionId, setDisputeAssertionId] = useState<`0x${string}`>(
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
  const [disputeAssertionExpiration, setDisputeAssertionExpiration] =
    useState<bigint>(0n);
  const [umaEvidence, setUmaEvidence] = useState<string>("");
  const [pendingProposeSide, setPendingProposeSide] = useState<
    "freelancer" | "client" | null
  >(null);

  const [umaCountdown, setUmaCountdown] = useState<string>("—");

  const [revisionMessage, setRevisionMessage] = useState<string>("");
  const [showGuide, setShowGuide] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [telegramToastShown, setTelegramToastShown] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | "approve"
    | "deposit"
    | "payFee"
    | "submitProof"
    | "approveJob"
    | "raiseDispute"
    | "requestRevision"
    | "startJob"
    | "refund"
    | "createEscrow"
    | "proposeResolution"
    | "finalizeDispute"
    | null
  >(null);

  const [headerHidden, setHeaderHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [pulseSuccess, setPulseSuccess] = useState(false);

  // extras
  const [escrowBnbBalance, setEscrowBnbBalance] = useState<bigint>(0n);
  const [tokenApprovedOnce, setTokenApprovedOnce] = useState(false);
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(0n);
  const [accruedFees, setAccruedFees] = useState<bigint>(0n);
  const [activeTab, setActiveTab] = useState<"dashboard" | "myescrows">(
    "dashboard",
  );
  const [myEscrows, setMyEscrows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const ESCROWS_PER_PAGE = 7;

  // ====== ENHANCEMENT: escrow token auto-lock ======
  const escrowTokenSymbol = useMemo<"USDT" | "USDC" | null>(() => {
    if (!escrowToken) return null;
    const cfg = CHAIN_CONFIG[currentChain.id];
    if (lower(escrowToken) === lower(cfg.usdt)) return "USDT";
    if (lower(escrowToken) === lower(cfg.usdc)) return "USDC";
    return null;
  }, [escrowToken, currentChain.id]);

  useEffect(() => {
    if (escrowTokenSymbol) setSettlement(escrowTokenSymbol);
  }, [escrowTokenSymbol]);

  const handleEscrowChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setEscrow(undefined);
      resetEscrowData();
      setFreelancerAddr(""); // Clear create form
      return;
    }
    if (isValidEthereumAddress(trimmed)) {
      setEscrow(trimmed as Address);
    } else {
      setEscrow(undefined);
      resetEscrowData();
      toast.error("Invalid escrow address.");
    }
  };

  // NEW: Reset all escrow data when address cleared
  const resetEscrowData = () => {
    setEscrowClient(undefined);
    setEscrowFreelancer(undefined);
    setEscrowOracle(undefined);
    setEscrowToken(undefined);
    setEscrowState(null);
    setDepositAmount(0n);
    setEscrowTokenDecimals(undefined);
    setDepositDeadline(0n);
    setStartDeadline(0n);
    setCompletionDeadline(0n);
    setRevisions(0);
    setMAX_REVISIONS(2n);
    setDISPUTE_GRACE(2n * 24n * 60n * 60n);
    setDisputeStart(0n);
    setDisputeAssertionId(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
    setDisputeAssertionExpiration(0n);

    setFEE(0n);
    setEscrowBnbBalance(0n);
    setTokenApprovedOnce(false);
    setTokenAllowance(0n);
    setAccruedFees(0n);
    setRole("unset");
    setStatus("Connect your wallet");
  };

  // ====== ENHANCEMENT: prevent wrong token selection ======
  const handleSettlementChange = (newToken: "USDT" | "USDC") => {
    if (escrowTokenSymbol && escrowTokenSymbol !== newToken) {
      toast.error(`This escrow only accepts ${escrowTokenSymbol}.`);
      setSettlement(escrowTokenSymbol);
      return;
    }
    setSettlement(newToken);
  };

  // ===== boot =====
  useEffect(() => {
    const cfg = CHAIN_CONFIG[currentChain.id];
    setPub(
      createPublicClient({
        chain: currentChain,
        transport: http(cfg.rpc),
      }),
    );
  }, [currentChain]);

  useEffect(() => {
    setTokenApprovedOnce(false);
  }, [escrow]);

  // ===== connect / disconnect =====
  const connect = async () => {
    try {
      setStatus("Connecting wallet...");
      let rawProvider: any;

      if (window.ethereum) {
        rawProvider = window.ethereum;
        setIsWalletConnect(false);
        await rawProvider.request({ method: "eth_requestAccounts" });
      } else {
        // Fallback to WalletConnect
        const wcProvider = await EthereumProvider.init({
          projectId: WC_ID,
          chains: [bscTestnet.id, baseSepolia.id],
          showQrModal: true,
        });

        await wcProvider.enable();
        rawProvider = wcProvider;
        setWc(wcProvider);
        setIsWalletConnect(true);
      }

      setProvider(rawProvider);

      // Events
      rawProvider.on("chainChanged", (cid: any) =>
        setChainId(normalizeChainId(cid)),
      );
      rawProvider.on("accountsChanged", (accs: string[]) => {
        if (Array.isArray(accs) && accs[0]) {
          setAddress(accs[0] as Address);
        } else {
          hardDisconnect();
        }
      });

      const cid = await rawProvider.request({ method: "eth_chainId" });
      setChainId(normalizeChainId(cid));

      const accounts = await rawProvider.request({ method: "eth_accounts" });
      const addr = accounts[0] as Address;
      if (!addr) throw new Error("No accounts found");

      const client = createWalletClient({
        chain: currentChain,
        transport: custom(rawProvider),
        account: addr,
      });

      setWallet(client);
      setAddress(addr);

      // === SUPABASE HISTORY FETCH ===
      setHistoryLoading(true);
      setHistoryError(null);
      setMyEscrows([]);

      try {
        const lowerAddress = addr.toLowerCase();

        // Client escrows
        const { data: clientData, error: clientError } = await supabase
          .from("escrows")
          .select("id, data")
          .ilike("data->>client", lowerAddress);

        // Freelancer escrows
        const { data: freelancerData, error: freelancerError } = await supabase
          .from("escrows")
          .select("id, data")
          .ilike("data->>freelancer", lowerAddress);

        if (clientError && freelancerError)
          throw clientError || freelancerError;

        // Combine and dedupe results
        const combined = [...(clientData || []), ...(freelancerData || [])];
        const uniqueMap = new Map();
        combined.forEach((row) => {
          if (!uniqueMap.has(row.id)) {
            uniqueMap.set(row.id, row);
          }
        });

        const data = Array.from(uniqueMap.values());

        // Sort by updated_at
        data.sort(
          (a: any, b: any) =>
            new Date(b.data.updated_at || 0).getTime() -
            new Date(a.data.updated_at || 0).getTime(),
        );

        const escrows = data.map((row: any) => ({
          escrow: row.id,
          ...row.data,
          isActive: !row.data.completed,
          stateLabel: STATE_LABEL[row.data.state || 0] || "Unknown",
        }));

        setMyEscrows(escrows);
        console.log("Loaded", escrows.length, "escrows from Supabase");
      } catch (err: any) {
        console.error("History load failed:", err);
        setHistoryError("Failed to load history. Try refreshing.");
      } finally {
        setHistoryLoading(false);
      }

      setStatus(`Connected: ${addr}`);
      toast.success("Connected");
    } catch (e: any) {
      const errorMsg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      const shortMsg =
        errorMsg.length > 300 ? errorMsg.substring(0, 300) + "..." : errorMsg;
      setStatus(`Connect failed: ${shortMsg}`);
      toast.error(`Connect failed`);
    }
  };

  const hardDisconnect = async () => {
    try {
      if (isWalletConnect && wc) {
        await wc.disconnect();
        await wc.cleanup?.();
      }
      const nuke = (store: Storage) => {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && (k.startsWith("wc@") || k.startsWith("walletconnect")))
            store.removeItem(k);
        }
      };
      nuke(localStorage);
      nuke(sessionStorage);
    } finally {
      setAddress(undefined);
      setWallet(undefined);
      setWc(null);
      setProvider(null);
      setIsWalletConnect(false);
      setRole("unset");
      setChainId("unknown");
      setEscrow(undefined);
      setEscrowClient(undefined);
      setEscrowFreelancer(undefined);
      setEscrowOracle(undefined);
      setEscrowToken(undefined);
      setEscrowState(null);
      setDepositAmount(0n);
      setEscrowBnbBalance(0n);
      setTokenApprovedOnce(false);
      setEscrowTokenDecimals(undefined);
      setStatus("Disconnected. Connect your wallet again.");
      toast.success("Disconnected");
    }
  };

  useEffect(() => {
    const check = async () => {
      if (provider) {
        const cid = await provider
          .request({ method: "eth_chainId" })
          .catch(() => "unknown");
        setChainId(normalizeChainId(cid));
      }
    };
    check();
    const h = setInterval(check, 5000);
    return () => clearInterval(h);
  }, [provider]);

  const tokenAddr = useMemo(
    () => (settlement === "USDT" ? USDT : USDC),
    [settlement],
  );

  const readDecimals = async (token: Address) => {
    if (currentChain.id === 84532) {
      return 6; // Base Sepolia USDT/USDC have 6 decimals
    }
    return (await pub!.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    })) as number;
  };

  const ensureCurrentChain = async (prov: any) => {
    if (!prov) {
      toast.error("Wallet provider not ready");
      return;
    }

    const targetChain = currentChain;
    const targetHex = `0x${targetChain.id.toString(16)}`;

    const currentWalletChain = await prov
      .request({ method: "eth_chainId" })
      .catch(() => "unknown");

    if (normalizeChainId(currentWalletChain) === targetHex) {
      return; // Already correct
    }

    let params;
    if (targetChain.id === bscTestnet.id) {
      params = BSC_TESTNET_PARAMS;
    } else if (targetChain.id === baseSepolia.id) {
      params = {
        chainId: targetHex,
        chainName: "Base Sepolia",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://sepolia.base.org"],
        blockExplorerUrls: ["https://sepolia.basescan.org"],
      };
    } else {
      toast.error("Unsupported chain selected");
      return;
    }

    try {
      await prov.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
      });
      toast.success(`Switched to ${targetChain.name}`);
    } catch (err: any) {
      if (err.code === 4902 || err.code === -32601) {
        // Chain not added
        try {
          await prov.request({
            method: "wallet_addEthereumChain",
            params: [params],
          });
          await prov.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetHex }],
          });
          toast.success(`Added & switched to ${targetChain.name}`);
        } catch (addErr: any) {
          toast.error(
            `Failed to add network: ${addErr.message || "Unknown error"}`,
          );
        }
      } else if (err.code === 4001) {
        toast.error("Network switch cancelled");
      } else {
        toast.error(`Switch failed: ${err.message || "Unknown error"}`);
      }
    }
  };

  // Reset to initial state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setActiveTab("dashboard");
      setMyEscrows([]);
      setHistoryLoading(false);
      setHistoryError(null);
      setEscrow(undefined);
    }
  }, [address]);

  useEffect(() => {
    if (!address) setCurrentPage(0);
  }, [address]);

  const clientHasDeposit = depositAmount > 0n;
  const clientPaidFee = accruedFees >= FEE && FEE > 0n;

  // Funding phase conditions
  const isDepositDeadlineExceeded =
    escrowState === 0 && depositDeadline > 0n && now() > depositDeadline;
  const isStartDeadlineExceeded =
    escrowState === 0 &&
    startDeadline > 0n &&
    now() > startDeadline &&
    clientHasDeposit &&
    clientPaidFee;

  // user-entered amount -> bigint
  const inputDec = escrowTokenDecimals ?? 6;
  const desiredAmount = parseUnits(amount || "0", inputDec);

  const isApprovedEnough =
    tokenAllowance >= desiredAmount && desiredAmount > 0n;

  const canClientApproveToken =
    escrowState === 0 && !isApprovedEnough && !isDepositDeadlineExceeded;

  const canClientDeposit =
    escrowState === 0 &&
    isApprovedEnough &&
    !clientHasDeposit &&
    !isDepositDeadlineExceeded;

  // Refund only when start deadline exceeded (after full funding)
  const canRefundNoStart = isStartDeadlineExceeded;

  const canClientApprove = escrowState === 2;
  const canClientRevise = escrowState === 2;
  const canRaiseDispute = escrowState === 2 || escrowState === 4;

  const canFreelancerStart =
    escrowState === 0 &&
    now() <= startDeadline &&
    clientHasDeposit &&
    clientPaidFee;
  const canFreelancerSubmit =
    (escrowState === 1 || escrowState === 4) && now() <= completionDeadline;
  const canOracleSettle =
    escrowState === 5 && now() >= disputeStart + DISPUTE_GRACE;

  const showClient = role === "client";
  const showFreelancer = role === "freelancer";

  // Client has at least ONE valid action
  const clientHasActions =
    showClient &&
    !isDepositDeadlineExceeded &&
    // Funding
    ((escrowState === 0 &&
      (!tokenApprovedOnce || !clientHasDeposit || !clientPaidFee)) ||
      // Review phase
      escrowState === 2 ||
      // Refund
      canRefundNoStart);

  // Freelancer has at least ONE valid action
  const freelancerHasActions =
    showFreelancer &&
    !isDepositDeadlineExceeded &&
    // Start
    ((escrowState === 0 && clientHasDeposit && clientPaidFee) ||
      // Work / Revise
      escrowState === 1 ||
      escrowState === 4 ||
      // Dispute
      escrowState === 2 ||
      escrowState === 4);

  const roleLabel: Record<Role, string> = {
    client: "Client",
    freelancer: "Freelancer",
    oracle: "Oracle",
    unknown: "Unknown",
    unset: "—",
  };

  const refreshRoleAndState = async (esc?: Address, acct?: Address) => {
    if (!pub || !esc) {
      setRole("unset");
      return;
    }

    // When disconnected, force defaults without reading (uniform UX)
    if (!address) {
      setEscrowClient("0x0000000000000000000000000000000000000000");
      setEscrowFreelancer("0x0000000000000000000000000000000000000000");
      setEscrowOracle("0x0000000000000000000000000000000000000000");
      setEscrowState(0); // Funding
      setDepositAmount(0n);
      setEscrowToken("0x0000000000000000000000000000000000000000");
      setFEE(0n);
      setDepositDeadline(0n);
      setStartDeadline(0n);
      setCompletionDeadline(0n);
      setRevisions(0);
      setMAX_REVISIONS(2n);
      setDisputeStart(0n);
      setDISPUTE_GRACE(2n * 24n * 60n * 60n);
      setEscrowBnbBalance(0n);
      setTokenApprovedOnce(false);
      setRole("unknown");
      setEscrowTokenDecimals(18);
      setStatus(
        `State=Funding | Deposit=0 ${escrowTokenSymbol || "TOKEN"} | Revisions=0/2 | Fee=0 ETH/BNB`,
      );
      return; // Exit early - no reads
    }

    try {
      const [
        cAddr,
        fAddr,
        oAddr,
        st,
        dep,
        stoken,
        fee,
        depDL,
        startDL,
        compDL,
        revs,
        maxRevs,
        dispStart,
        dispGrace,
        proofHashFromContract,
        revisionMessageFromContract,
        assertionIdFromContract,
        assertionExpirationFromContract,
        accruedFeesFromContract,
      ] = await Promise.all([
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "client",
          })
          .catch(
            () => "0x0000000000000000000000000000000000000000",
          ) as Promise<Address>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "freelancer",
          })
          .catch(
            () => "0x0000000000000000000000000000000000000000",
          ) as Promise<Address>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "oracle",
          })
          .catch(
            () => "0x0000000000000000000000000000000000000000",
          ) as Promise<Address>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "state",
          })
          .catch(() => 0n),
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "depositAmount",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "settlementToken",
          })
          .catch(
            () => "0x0000000000000000000000000000000000000000",
          ) as Promise<Address>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "FEE",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "depositDeadline",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "startDeadline",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "completionDeadline",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "revisions",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "MAX_REVISIONS",
          })
          .catch(() => 2n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "disputeStart",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "DISPUTE_GRACE",
          })
          .catch(() => 2n * 24n * 60n * 60n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "proofHash", // ← Added here to read proofHash
          })
          .catch(() => "") as Promise<string>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "revisionMessage",
          })
          .catch(() => "") as Promise<string>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "disputeAssertionId",
          })
          .catch(
            () =>
              "0x0000000000000000000000000000000000000000000000000000000000000000",
          ) as Promise<`0x${string}`>,

        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "disputeAssertionExpiration",
          })
          .catch(() => 0n) as Promise<bigint>,
        pub
          .readContract({
            address: esc,
            abi: escrowAbi as any,
            functionName: "accruedFees",
          })
          .catch(() => 0n) as Promise<bigint>,
      ]);

      // Connected-only wrong chain warning
      if (
        cAddr === "0x0000000000000000000000000000000000000000" &&
        fAddr === "0x0000000000000000000000000000000000000000" &&
        oAddr === "0x0000000000000000000000000000000000000000"
      ) {
        setStatus("Wrong chain for this escrow - switch network and refresh");
        toast.error(
          "Wrong chain for this escrow - switch to the other network",
        );
        setRole("unknown");
        return; // Exit early
      }

      setEscrowClient(cAddr);
      setEscrowFreelancer(fAddr);
      setEscrowOracle(oAddr);
      setEscrowState(Number(st));
      setDepositAmount(dep);
      setEscrowToken(stoken);
      setFEE(fee);
      setDepositDeadline(depDL);
      setStartDeadline(startDL);
      setCompletionDeadline(compDL);
      setRevisions(Number(revs));
      setMAX_REVISIONS(maxRevs);
      setDisputeStart(dispStart);
      setDISPUTE_GRACE(dispGrace);
      setProofHash(proofHashFromContract); // ← Added here to set the state
      setRevisionMessage(revisionMessageFromContract);
      setAccruedFees(accruedFeesFromContract);
      setDisputeAssertionId(assertionIdFromContract);
      setDisputeAssertionExpiration(assertionExpirationFromContract);

      const bal = await pub.getBalance({ address: esc }).catch(() => 0n);
      setEscrowBnbBalance(bal);
      if (dep > 0n) setTokenApprovedOnce(true);

      if (acct) {
        if (lower(acct) === lower(cAddr)) setRole("client");
        else if (lower(acct) === lower(fAddr)) setRole("freelancer");
        else if (lower(acct) === lower(oAddr)) setRole("oracle");
        else setRole("unknown");
      } else setRole("unknown");

      const dec = await readDecimals(stoken).catch(() => 18);
      setEscrowTokenDecimals(dec);

      // Read client allowance (for approval correctness)
      if (acct && lower(acct) === lower(cAddr)) {
        const a = (await pub
          .readContract({
            address: stoken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [acct, esc],
          })
          .catch(() => 0n)) as bigint;

        setTokenAllowance(a);
      } else {
        setTokenAllowance(0n);
      }

      const currencySymbol = currentChain.id === 97 ? "BNB" : "ETH";
      setStatus(
        `State=${STATE_LABEL[Number(st)] || st} | Deposit=${formatUnits(dep, dec)} ${escrowTokenSymbol || "TOKEN"} | Revisions=${revs}/${maxRevs} | Fee=${formatUnits(fee, 18)} ${currencySymbol}`,
      );
    } catch (e: any) {
      const errorMsg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      const shortMsg =
        errorMsg.length > 300 ? errorMsg.substring(0, 300) + "..." : errorMsg;
      setStatus(`Read failed: ${shortMsg}`);
      setRole("unknown");
    }
  };

  const readStateAll = async () => {
    if (!escrow) {
      setStatus("Enter an escrow address to read state.");
      return;
    }

    try {
      setRefreshing(true);
      await refreshRoleAndState(escrow, address);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (escrow) refreshRoleAndState(escrow, address);
  }, [escrow, address]);

  const tryOpenWallet = () => {
    if (isWalletConnect && wc) {
      const uri = wc?.connector?.uri;
      if (uri) {
        const base = WALLET_DEEPLINK || "wc:";
        window.open(`${base}${encodeURIComponent(uri)}`, "_blank");
        return;
      }
      if (WALLET_DEEPLINK) {
        window.open(WALLET_DEEPLINK, "_blank");
        return;
      }
    } else if (window.ethereum) {
      window.ethereum
        .request({ method: "eth_requestAccounts" })
        .catch(() => {});
    }
  };

  const withPending = async (
    action: NonNullable<typeof pendingAction>,
    fn: () => Promise<void>,
  ) => {
    setPendingAction(action);

    if (isWalletConnect) tryOpenWallet();

    try {
      await fn();
    } catch (e: any) {
      const errorMsg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";

      const shortMsg =
        errorMsg.length > 300 ? errorMsg.substring(0, 300) + "..." : errorMsg;

      setStatus(`Action failed: ${shortMsg}`);
    } finally {
      setTimeout(() => setPendingAction(null), 1500);
    }
  };

  const explorerTx = (hash: string) =>
    CHAIN_CONFIG[currentChain.id].explorerTx(hash);
  const explorerAddr = (addr: string) =>
    CHAIN_CONFIG[currentChain.id].explorerAddr(addr);

  // Auto-refresh My Escrows history when tab is opened
  useEffect(() => {
    if (activeTab === "myescrows" && address) {
      const refreshHistory = async () => {
        setHistoryLoading(true);
        setHistoryError(null);

        try {
          const lowerAddress = address.toLowerCase();

          // Client escrows
          const { data: clientData } = await supabase
            .from("escrows")
            .select("id, data")
            .ilike("data->>client", lowerAddress);

          // Freelancer escrows
          const { data: freelancerData } = await supabase
            .from("escrows")
            .select("id, data")
            .ilike("data->>freelancer", lowerAddress);

          const combined = [...(clientData || []), ...(freelancerData || [])];
          const uniqueMap = new Map();
          combined.forEach((row: any) => uniqueMap.set(row.id, row));

          const data = Array.from(uniqueMap.values());

          // Sort newest first
          data.sort(
            (a: any, b: any) =>
              new Date(b.data.updated_at || 0).getTime() -
              new Date(a.data.updated_at || 0).getTime(),
          );

          const escrows = data.map((row: any) => ({
            escrow: row.id,
            ...row.data,
            isActive: !row.data.completed,
            stateLabel: STATE_LABEL[row.data.state || 0] || "Unknown",
          }));

          setMyEscrows(escrows);
        } catch (err: any) {
          console.error("Auto-refresh failed:", err);
          setHistoryError("Failed to refresh history");
        } finally {
          setHistoryLoading(false);
        }
      };

      refreshHistory();
    }
  }, [activeTab, address]);

  useEffect(() => {
    if (!showChainMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      setShowChainMenu(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChainMenu]);

  useEffect(() => {
    const walletChainId = parseInt(
      normalizeChainId(chainId).replace("0x", ""),
      16,
    );

    if (walletChainId === 97) {
      setCurrentChain(bscTestnet);
    } else if (walletChainId === 84532) {
      setCurrentChain(baseSepolia);
    } else {
      console.warn("Unsupported wallet chain ID:", walletChainId);
    }
  }, [chainId]);

  // Re-create walletClient when currentChain changes
  useEffect(() => {
    if (provider && address) {
      const newWallet = createWalletClient({
        chain: currentChain,
        transport: custom(provider),
        account: address,
      });
      setWallet(newWallet);
      console.log("WalletClient updated for chain:", currentChain.id);
    }
  }, [currentChain, provider, address]);

  // Show Telegram toast whenever escrow loads
  useEffect(() => {
    if (
      escrow &&
      address &&
      (lower(address) === lower(escrowClient) ||
        lower(address) === lower(escrowFreelancer) ||
        lower(address) === lower(escrowOracle))
    ) {
      toast(
        (t) => (
          <span>
            📲 Get instant Telegram alerts via{" "}
            <a
              href="https://t.me/afrilance_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline"
            >
              @AfriLance_Bot
            </a>
          </span>
        ),
        { duration: 5000 },
      );
    }
  }, [escrow, escrowClient, escrowFreelancer, escrowOracle, address]);

  // Auto-expand sections when relevant (power user UX)
  useEffect(() => {
    // Expand payment if funding incomplete
    if (escrowState === 0 && (!clientHasDeposit || !clientPaidFee)) {
      setShowPaymentInfo(true);
    }

    // Expand timeline if deadlines near / dispute
    if (
      escrowState === 5 || // Disputed
      (completionDeadline > 0n && now() + 6n * 60n * 60n > completionDeadline) // < 6hrs left
    ) {
      setShowTimeline(true);
    }

    // Expand participants if user is unknown
    if (role === "unknown") {
      setShowParticipants(true);
    }
  }, [escrowState, clientHasDeposit, clientPaidFee, completionDeadline, role]);

  // Reset collapsibles when escrow changes
  useEffect(() => {
    setShowParticipants(false);
    setShowTimeline(false);
    setShowPaymentInfo(false);
  }, [escrow]);

  // ===== FINAL: Create New Escrow + Auto-Detect & Load =====

  const createNewEscrow = async () => {
    try {
      if (!wallet || !address) throw new Error("Connect your wallet first");

      if (!isValidEthereumAddress(freelancerAddr))
        throw new Error("Enter a valid freelancer address");

      const cfg = CHAIN_CONFIG[currentChain.id];

      if (!cfg.factory || !isValidEthereumAddress(cfg.factory)) {
        throw new Error(`Factory not configured for ${cfg.chainName}`);
      }

      if (!cfg.oracle || !isValidEthereumAddress(cfg.oracle)) {
        throw new Error(`Oracle not configured for ${cfg.chainName}`);
      }

      // Settlement token from form
      const tokenAddr = settlementToken === "USDT" ? cfg.usdt : cfg.usdc;

      const checksumFactory = getAddress(cfg.factory);
      const checksumToken = getAddress(tokenAddr);

      await ensureCurrentChain(provider);

      await withPending("createEscrow", async () => {
        setStatus(
          `Creating escrow on ${cfg.chainName}... Please confirm in wallet`,
        );

        toast.success(`Creating on ${cfg.chainName}...`);

        const hash = await wallet.writeContract({
          address: checksumFactory,
          abi: factoryAbi as any,
          functionName: "createJob",
          args: [address, freelancerAddr, checksumToken],
          account: address,
        });

        setStatus(`Escrow deploying... Tx: ${hash}`);

        const receipt = await pub!.waitForTransactionReceipt({ hash });

        if (receipt.status !== "success") {
          throw new Error("Transaction reverted");
        }

        let newEscrowAddr: Address | null = null;

        const factoryInterface = new ethers.Interface(factoryAbi as any);

        for (const log of receipt.logs) {
          try {
            const parsed = factoryInterface.parseLog({
              topics: log.topics,
              data: log.data,
            });

            if (parsed?.name === "JobCreated") {
              newEscrowAddr = parsed.args[0] as Address;
              break;
            }
          } catch {
            // ignore non-matching logs
          }
        }

        if (newEscrowAddr && isValidEthereumAddress(newEscrowAddr)) {
          setEscrow(newEscrowAddr);
          setFreelancerAddr("");
          setSettlementToken(settlementToken);

          setStatus(
            `Success! New escrow loaded on ${cfg.chainName}: ${newEscrowAddr}`,
          );

          toast.success(
            (t) => (
              <div className="flex flex-col gap-2 text-sm">
                <div className="font-semibold text-green-400">
                  Escrow Created Successfully
                </div>

                <div className="text-gray-300">
                  {newEscrowAddr.slice(0, 6)}...{newEscrowAddr.slice(-4)}
                </div>

                <a
                  href={CHAIN_CONFIG[currentChain.id].explorerAddr(
                    newEscrowAddr,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline text-xs"
                  onClick={() => toast.dismiss(t.id)}
                >
                  View on Explorer →
                </a>
              </div>
            ),
            {
              duration: 4000,
            },
          );

          // ✅ Pulse first, then refresh
          setPulseSuccess(true);

          setTimeout(async () => {
            await refreshRoleAndState(newEscrowAddr, address);
            setPulseSuccess(false);
          }, 1200);
        } else {
          setStatus("Tx confirmed. Copy escrow address from explorer.");
        }
      });
    } catch (e: any) {
      const errorMsg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";

      const shortMsg =
        errorMsg.length > 300 ? errorMsg.substring(0, 300) + "..." : errorMsg;

      setStatus(`Failed: ${shortMsg}`);
      toast.error(shortMsg);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      // Hide when scrolling down
      if (currentY > lastScrollY && currentY > 80) {
        setHeaderHidden(true);
      }

      // Show when scrolling up
      if (currentY < lastScrollY) {
        setHeaderHidden(false);
      }

      setLastScrollY(currentY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY]);

  // ===== client actions =====
  const approveSpending = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client") throw new Error("Only the client can approve");
      if (escrowState !== 0)
        throw new Error("Approval allowed only in Funding state");

      await ensureCurrentChain(provider);

      const cfg = CHAIN_CONFIG[currentChain.id];
      const tokenAddr = settlement === "USDT" ? cfg.usdt : cfg.usdc;

      const checksumToken = getAddress(tokenAddr);

      const dec = await readDecimals(checksumToken);
      const amtBigInt = parseUnits(amount || "0", dec);

      if (amtBigInt === 0n) {
        toast.error("Approval amount must be greater than 0");
        return;
      }

      await withPending("approve", async () => {
        const hash = await wallet.writeContract({
          address: checksumToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [escrow!, amtBigInt],
          account: address,
        });

        setStatus(`Approve tx: ${hash} (${explorerTx(hash)})`);
        setTokenApprovedOnce(true);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Approve failed: ${msg}`);
    }
  };

  const depositFn = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client") throw new Error("Only the client can deposit");
      if (escrowState !== 0)
        throw new Error("Deposit allowed only in Funding state");

      await ensureCurrentChain(provider);

      const cfg = CHAIN_CONFIG[currentChain.id];
      const tokenAddr = settlement === "USDT" ? cfg.usdt : cfg.usdc;

      const checksumToken = getAddress(tokenAddr);

      const dec = await readDecimals(checksumToken);
      const amtBigInt = parseUnits(amount || "0", dec);

      if (amtBigInt === 0n) {
        toast.error("Deposit amount must be greater than 0");
        return;
      }

      await withPending("deposit", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "deposit",
          args: [amtBigInt],
          account: address,
        });

        setStatus(`Deposit tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Deposit failed: ${msg}`);
    }
  };

  const payFee = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client") throw new Error("Only the client can pay fee");
      if (escrowState !== 0)
        throw new Error("Fee allowed only in Funding state");

      await ensureCurrentChain(provider);

      await withPending("payFee", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "payFee",
          args: [],
          account: address,
          value: FEE,
        });

        setStatus(`PayFee tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`PayFee failed: ${msg}`);
    }
  };

  const requestRevision = async (msg: string) => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client")
        throw new Error("Only the client can request revision");
      if (escrowState !== 2)
        throw new Error("Revision only after proof is Submitted");

      await ensureCurrentChain(provider);

      await withPending("requestRevision", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "requestRevision",
          args: [msg],
          account: address,
        });

        setStatus(`RequestRevision tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`RequestRevision failed: ${msg}`);
    }
  };

  const approveJob = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client") throw new Error("Only the client can approve");
      if (escrowState !== 2) throw new Error("Approve only when Submitted");

      await ensureCurrentChain(provider);

      await withPending("approveJob", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "approve",
          args: [],
          account: address,
        });

        setStatus(`Approve tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Approve failed: ${msg}`);
    }
  };

  const raiseDispute = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");

      if (role !== "client" && role !== "freelancer")
        throw new Error("Only client or freelancer can dispute");

      if (!canRaiseDispute) throw new Error("Invalid dispute state");

      await ensureCurrentChain(provider);

      await withPending("raiseDispute", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "raiseDispute",
          args: [],
          account: address,
        });

        setStatus(`Dispute raised: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Dispute failed: ${msg}`);
    }
  };

  const isBaseSepolia = currentChain.id === 84532;

  useEffect(() => {
    if (!escrow || escrowState !== 5 || currentChain.id !== 84532) {
      setUmaCountdown("—");
      return;
    }

    const tick = () => {
      if (!disputeAssertionExpiration || disputeAssertionExpiration === 0n) {
        setUmaCountdown("—");
        return;
      }

      const nowTs = BigInt(Math.floor(Date.now() / 1000));
      if (nowTs >= disputeAssertionExpiration) {
        setUmaCountdown("Expired ✅");
        return;
      }

      const left = disputeAssertionExpiration - nowTs;
      const secs = Number(left);

      const hrs = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const s = secs % 60;

      setUmaCountdown(`${hrs}h ${mins}m ${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [escrow, escrowState, currentChain.id, disputeAssertionExpiration]);

  const emptyAssertion =
    disputeAssertionId ===
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  // ===== Dispute grace gating (prevents early propose reverts) =====
  const graceEndsAt = useMemo(() => {
    if (disputeStart === 0n || DISPUTE_GRACE === 0n) return 0n;
    return disputeStart + DISPUTE_GRACE;
  }, [disputeStart, DISPUTE_GRACE]);

  const canProposeNow = useMemo(() => {
    if (graceEndsAt === 0n) return false;
    return now() >= graceEndsAt;
  }, [graceEndsAt]);

  const graceCountdown = useMemo(() => {
    if (graceEndsAt === 0n) return "—";
    const t = now();
    if (t >= graceEndsAt) return "Grace elapsed ✅";

    const left = graceEndsAt - t;
    const totalMins = Number(left / 60n);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}h ${mins}m left`;
  }, [graceEndsAt, disputeStart, DISPUTE_GRACE, escrowState]);

  const proposeUmaResolution = async (freelancerWins: boolean) => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (escrowState !== 5) throw new Error("Escrow is not in Disputed state");
      if (!isBaseSepolia) throw new Error("UMA resolution is only on Base");
      if (!emptyAssertion) throw new Error("Resolution already proposed");

      if (!umaEvidence || umaEvidence.trim().length < 8) {
        toast.error("Evidence link is required");
        return;
      }

      // ✅ mark which button was clicked
      setPendingProposeSide(freelancerWins ? "freelancer" : "client");

      await ensureCurrentChain(provider);

      await withPending("proposeResolution", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "proposeDisputeResolution",
          args: [freelancerWins, umaEvidence.trim()], // ✅ explicit boolean you clicked
          account: address,
        });

        setStatus(`Proposed UMA resolution: ${hash} (${explorerTx(hash)})`);

        await new Promise((r) => setTimeout(r, 1200));
        await refreshRoleAndState(escrow!, address!);

        // optional: clear evidence after success
        setUmaEvidence("");
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Propose failed: ${msg}`);
      toast.error(msg);
    } finally {
      // ✅ always clear after tx finishes or fails
      setPendingProposeSide(null);
    }
  };

  const finalizeUmaDispute = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");

      if (escrowState !== 5) throw new Error("Escrow is not in Disputed state");
      if (!isBaseSepolia) throw new Error("Finalize is only on Base");
      if (emptyAssertion) throw new Error("No UMA assertion yet");

      const nowTs = BigInt(Math.floor(Date.now() / 1000));
      if (
        disputeAssertionExpiration > 0n &&
        nowTs < disputeAssertionExpiration
      ) {
        toast.error("Not expired yet. Wait for the liveness timer.");
        return;
      }

      await ensureCurrentChain(provider);

      await withPending("finalizeDispute", async () => {
        // settleDispute(bool) — on Base the bool is ignored in your contract
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "settleDispute",
          args: [false],
          account: address,
        });

        setStatus(`Finalizing UMA dispute: ${hash} (${explorerTx(hash)})`);

        await new Promise((r) => setTimeout(r, 1200));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Finalize failed: ${msg}`);
      toast.error(msg);
    }
  };

  const refundNoStart = async () => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "client") throw new Error("Only client can refund");

      if (!canRefundNoStart) throw new Error("Refund not allowed yet");

      await ensureCurrentChain(provider);

      await withPending("refund", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "refundNoStart",
          args: [],
          account: address,
        });

        setStatus(`Refund tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`Refund failed: ${msg}`);
    }
  };

  const startJob = async (days: number) => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "freelancer") throw new Error("Only freelancer can start");

      if (!canFreelancerStart) throw new Error("Start not allowed");

      await ensureCurrentChain(provider);

      await withPending("startJob", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "startJob",
          args: [BigInt(days)],
          account: address,
        });

        setStatus(`StartJob tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`StartJob failed: ${msg}`);
    }
  };

  const submitProof = async (rawInput: string) => {
    try {
      if (!wallet || !address || !escrow)
        throw new Error("Connect wallet and set escrow");
      if (role !== "freelancer") throw new Error("Only freelancer can submit");

      if (!canFreelancerSubmit) throw new Error("Submit not allowed");

      const cid = normalizeAndValidateCid(rawInput);

      if (!cid) {
        toast.error("Invalid IPFS CID");
        return;
      }

      await ensureCurrentChain(provider);

      await withPending("submitProof", async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: "submitProof",
          args: [cid],
          account: address,
        });

        setStatus(`SubmitProof tx: ${hash} (${explorerTx(hash)})`);

        setPulseSuccess(true);

        await new Promise((r) => setTimeout(r, 1200));

        await refreshRoleAndState(escrow!, address!);

        setPulseSuccess(false);
      });
    } catch (e: any) {
      const msg =
        e?.shortMessage || e?.message || e?.toString() || "Unknown error";
      setStatus(`SubmitProof failed: ${msg}`);
    }
  };

  const wrongNet =
    normalizeChainId(chainId) !== `0x${currentChain.id.toString(16)}` &&
    chainId !== "unknown";

  const nextAction = (() => {
    if (!address) return "Connect your wallet";
    if (escrowState === null) return "Load or Create an Escrow";

    // Completed or settled
    if (escrowState === 3 || escrowState === 6) {
      return "This escrow has been completed. No further actions.";
    }

    // Expired funding cases (only in state 0)
    if (escrowState === 0) {
      if (now() > depositDeadline) {
        return "Deposit deadline exceeded. Escrow inactive — no actions possible.";
      }
      if (now() > startDeadline && clientHasDeposit && clientPaidFee) {
        return "Start deadline exceeded. Client can refund deposited funds.";
      }
    }

    // Normal flow (your existing role-based messages)
    if (role === "client") {
      if (escrowState === 0) {
        if (!clientHasDeposit && !tokenApprovedOnce)
          return "Step 1: Approve token";
        if (!clientHasDeposit && tokenApprovedOnce)
          return "Step 2: Deposit tokens";
        if (!clientPaidFee) return "Step 3: Pay fee";
        return "Wait for freelancer to start";
      }
      if (escrowState === 1) return "Wait for freelancer to submit proof";
      if (escrowState === 2)
        return "Review proof → Approve or Request Revision (or Raise Dispute)";
      if (escrowState === 4) return "Wait for freelancer to resubmit proof";
      if (escrowState === 5) return "Disputed: wait for oracle to settle";
    }
    if (role === "freelancer") {
      if (escrowState === 0) {
        if (!clientHasDeposit) return "Wait for client to deposit & pay fee";
        if (!clientPaidFee) return "Wait for client to pay fee";
        return "Ready to start job";
      }
      if (escrowState === 1)
        return "Work in progress — Submit Proof before deadline";
      if (escrowState === 2) return "Wait for client’s decision";
      if (escrowState === 4) return "Revision requested — Submit Proof again";
      if (escrowState === 5) return "Disputed: wait for oracle to settle";
    }
    if (role === "oracle") {
      if (escrowState === 5) return "After grace period, press a Settle button";
      return "No action for oracle";
    }
    return "You are not assigned to this escrow";
  })();

  const startJobPrompt = async () => {
    const daysStr = prompt(
      "How many days will you take to complete this job? (whole number)",
    );
    if (!daysStr) return;
    const days = Number(daysStr);
    if (Number.isNaN(days) || days <= 0)
      return toast.error("Enter a valid number of days");
    await startJob(days);
  };

  const submitProofPrompt = async () => {
    const input = prompt(
      "Paste your IPFS CID (with or without ipfs:// prefix)",
    );
    if (!input) return;

    const cid = normalizeAndValidateCid(input);
    if (!cid) {
      toast.error(
        "Invalid CID!\n\nMust be exactly 59 characters.\n\nCorrect examples:\n• bafybei...\n• ipfs://bafybei...",
      );
      return;
    }

    await submitProof(cid);
  };

  const requestRevisionPrompt = async () => {
    const msg = prompt("Enter revision note (plain text)");
    if (!msg) return;
    await requestRevision(msg);
  };

  const panelShouldShow = !!escrow;

  const panelDepositDisplay = (() => {
    if (
      !panelShouldShow ||
      !address ||
      (role !== "client" && role !== "freelancer" && role !== "oracle")
    )
      return "—";
    return depositAmount > 0n
      ? `${formatUnits(depositAmount, escrowTokenDecimals ?? 18)} ${escrowTokenSymbol || "TOKEN"}`
      : "No";
  })();

  const panelFeePaidDisplay = (() => {
    if (
      !panelShouldShow ||
      !address ||
      (role !== "client" && role !== "freelancer" && role !== "oracle")
    )
      return "—";
    return escrowBnbBalance >= FEE && FEE > 0n ? "Yes" : "No";
  })();

  const panelSettlementDisplay = (() => {
    if (!panelShouldShow || !address) return "USDT / USDC";
    return escrowTokenSymbol || "—";
  })();

  const proofLink = useMemo(() => {
    if (!proofHash || proofHash === "") return null;

    const gatewayUrl = `https://ipfs.io/ipfs/${proofHash.replace("ipfs://", "")}`;

    return (
      <a
        href={gatewayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600/30 hover:bg-green-600/50 text-white rounded-lg text-sm font-medium transition-all border border-green-500/30"
      >
        <FaExternalLinkAlt size={14} />
        View Submitted Proof
      </a>
    );
  }, [proofHash]);

  return (
    <div className="container" role="application" aria-label="AfriLance">
      <div className="bgBlockchain" aria-hidden="true" />

      <Toaster
        position="top-center"
        containerStyle={{
          top: 70,
          left: 0,
          right: 0,
          bottom: "auto",
          pointerEvents: "none",
          zIndex: 9999,
        }}
        toastOptions={{
          duration: 3000, // shorter = better UX
          style: {
            background: "#1f2937",
            color: "#f9fafb",
            border: "1px solid #3b82f6",
            borderRadius: "12px",
            maxWidth: "70vw", // 🔥 mobile-safe
            width: "fit-content",
            margin: "0 auto",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            padding: "14px 16px",
            fontSize: "14px",
            textAlign: "center",
            pointerEvents: "auto",
          },
          success: {
            style: {
              border: "1px solid #22c55e",
              background: "#13251b",
            },
          },
          error: {
            style: {
              border: "1px solid #ef4444",
              background: "#1f1a1a",
            },
          },
        }}
      />

      <header
        className={`topBar fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* Extended background that flows behind the main content */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gray-800 opacity-50 pointer-events-none"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 py-4">
          {!address ? (
            /* ==== DISCONNECTED STATE - unchanged ==== */
            <div className="text-center py-12 px-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent mb-6 leading-tight whitespace-nowrap">
                AfriLance Escrow
              </h1>
              <p className="text-gray-400 text-base sm:text-lg mb-10 max-w-lg mx-auto leading-snug px-4">
                Decentralized escrow for freelance payments on BNB Testnet/Base
                Sepolia using stablecoins (USDT/USDC). Client and freelancer set
                their terms and enforce them securely.
              </p>
              <button
                onClick={connect}
                className="ui-btn px-5 py-2 rounded-xl bg-red-900/60 hover:bg-red-800/80 hover:shadow-lg border border-red-800 text-red-300 font-medium transition-all flex items-center gap-2 whitespace-nowrap transform hover:scale-105"
              >
                <FaWallet size={22} />
                Connect Wallet
              </button>
              <p className="text-gray-500 text-xs mt-3 mb-0 max-w-md mx-auto text-center leading-snug px-4">
                Supports MetaMask, WalletConnect and all other wallets
              </p>
            </div>
          ) : (
            /* ==== CONNECTED STATE - Clean, compact, modern ==== */
            <div className="space-y-5">
              {/* Single compact wallet card with Disconnect on the same line */}
              <div className="bg-gray-800/70 backdrop-blur border border-gray-700 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between gap-4">
                  {/* Left side: Address + Role + Network */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-400">Connected</div>
                    <div className="mono text-base font-medium">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Role:</span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            role === "client"
                              ? "bg-blue-600/70 text-blue-100"
                              : role === "freelancer"
                                ? "bg-green-600/70 text-green-100"
                                : role === "oracle"
                                  ? "bg-purple-600/70 text-purple-100"
                                  : role === "unknown"
                                    ? "bg-gray-600 text-gray-300"
                                    : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {roleLabel[role]}
                        </span>
                      </div>
                      {/* Network Switcher Buttons – Sharp rectangular */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">Network:</span>
                        <div className="inline-flex overflow-hidden bg-gray-800/50 border border-gray-700 shadow-sm rounded-lg">
                          <button
                            onClick={() => {
                              setCurrentChain(bscTestnet);
                              ensureCurrentChain(provider);
                            }}
                            className={`net-btn px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 hover:scale-[1.02] border-r border-gray-700 ${
                              Number(currentChain.id) === bscTestnet.id
                                ? "!bg-yellow-600 !text-white !shadow-inner font-semibold rounded-l-md"
                                : "text-gray-300 hover:bg-gray-700/70 hover:text-yellow-200 rounded-l-md"
                            }`}
                          >
                            BNB
                          </button>
                          <button
                            onClick={() => {
                              setCurrentChain(baseSepolia);
                              ensureCurrentChain(provider);
                            }}
                            className={`net-btn px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 hover:scale-[1.02] ${
                              Number(currentChain.id) === baseSepolia.id
                                ? "!bg-blue-600 !text-white !shadow-inner font-semibold rounded-r-md"
                                : "text-gray-300 hover:bg-gray-700/70 hover:text-blue-200 rounded-r-md"
                            }`}
                          >
                            Base
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Disconnect button (compact) */}
                  <div className="flex items-center gap-3">
                    {wrongNet && (
                      <button
                        className="ui-btn switch-btn px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800/70 border border-red-700 text-xs font-medium transition-all hover:scale-105 whitespace-nowrap shadow-sm"
                        onClick={() => ensureCurrentChain(provider)}
                      >
                        Switch to{" "}
                        {Number(currentChain.id) === bscTestnet.id
                          ? "BNB"
                          : "Base"}
                      </button>
                    )}
                    <button
                      onClick={hardDisconnect}
                      className="ui-btn px-5 py-2 rounded-xl bg-red-900/60 hover:bg-red-800/80 hover:shadow-lg border border-red-800 text-red-300 font-medium transition-all flex items-center gap-2 whitespace-nowrap transform hover:scale-105"
                    >
                      <FaWallet size={16} />
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs - unchanged */}
              <div className="tabSwitcher">
                <button
                  className={`tabButton ${activeTab === "dashboard" ? "tabActive" : ""}`}
                  onClick={() => setActiveTab("dashboard")}
                >
                  Dashboard
                </button>
                <button
                  className={`tabButton ${activeTab === "myescrows" ? "tabActive" : ""}`}
                  onClick={() => setActiveTab("myescrows")}
                >
                  My Escrows
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="main max-w-4xl mx-auto px-6 pb-12 ">
        {activeTab === "dashboard" ? (
          <>
            {escrow && escrowState !== undefined && (
              <div className="mt-8">
                <div className="overflow-x-auto scrollbar-hide px-4 md:px-0">
                  <div className="flex items-center justify-between gap-4 min-w-max md:min-w-0 md:gap-2">
                    {STEPS.map((step, index) => {
                      let isFilled = false;

                      const state = Number(escrowState); // normalize for TS + safety

                      if (escrowState === null) {
                        isFilled = false;
                      } else if (step.state <= 2) {
                        isFilled = state > step.state;
                      } else if (step.state === 4) {
                        // Revised
                        isFilled = state === 4 || (state > 4 && state !== 3);
                      } else if (step.state === 3) {
                        // Approved
                        isFilled =
                          state === 3 ||
                          (state > 3 && state !== 4 && state !== 5);
                      } else if (step.state === 5) {
                        // Disputed
                        isFilled = state === 5 || state === 6;
                      } else if (step.state === 6) {
                        // Resolved
                        isFilled = state === 6;
                      }

                      return (
                        <div
                          key={step.state}
                          className="relative flex flex-col items-center flex-1 md:flex-initial"
                        >
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-md ${
                              escrowState === step.state
                                ? "bg-green-500 text-white shadow-green-500/60"
                                : isFilled
                                  ? "bg-green-600/80 text-white"
                                  : "bg-gray-700 text-gray-400"
                            }`}
                          >
                            {isFilled ? <FaCheckCircle size={20} /> : index + 1}
                          </div>

                          <p className="mt-2 text-xs text-center text-gray-300 leading-tight">
                            {step.label}
                          </p>

                          {index < STEPS.length - 1 && (
                            <div
                              className={`absolute top-6 left-12 right-0 h-0.5 -z-10 transition-all ${
                                isFilled ? "bg-green-500" : "bg-gray-700"
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="formGroup bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg mb-8">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label
                    htmlFor="escrowAddress"
                    className="block text-sm text-gray-400 mb-2"
                  >
                    Escrow Address
                  </label>
                  <input
                    id="escrowAddress"
                    placeholder="0x..."
                    value={escrow || ""}
                    onChange={(e) => handleEscrowChange(e.target.value)}
                    className="fullWidth text-base py-3 px-4"
                  />
                </div>
                {escrow && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(escrow);
                      toast.success("Escrow address copied!");
                    }}
                    className="ui-btn px-6 py-3 bg-gray-700 hover:bg-gray-600 hover:shadow-md rounded-lg flex items-center gap-2 whitespace-nowrap transition-all transform hover:scale-105"
                  >
                    <FaCopy size={18} />
                    Copy
                  </button>
                )}
              </div>
              <div className="buttonGroup mt-4">
                <button
                  disabled={refreshing}
                  onClick={readStateAll}
                  className="
    ui-btn refresh-btn flex items-center gap-2 px-4 py-2
    bg-gray-700 hover:bg-gray-600
    hover:shadow-md
    rounded-lg
    transition-all
    transform hover:scale-105
    disabled:opacity-50
    disabled:cursor-not-allowed
  "
                >
                  <FaSyncAlt
                    size={18}
                    className={refreshing ? "animate-spin" : ""}
                  />

                  {refreshing ? "Refreshing..." : "Refresh Status"}
                </button>
              </div>
            </div>

            {/* ===== Collapsible Info Panels ===== */}
            {panelShouldShow && (
              <div className="mt-6 space-y-4">
                {/* Participants */}
                {escrowClient && escrowFreelancer && (
                  <div>
                    <button
                      onClick={() => setShowParticipants(!showParticipants)}
                      className="
    w-full flex items-center justify-start
    px-4 py-2
    !bg-gray-800/70 hover:!bg-gray-700/90
    !border !border-gray-700
    rounded-md
    text-sm !text-blue-400 hover:!text-white
    transition-all
  "
                    >
                      <span>
                        {showParticipants
                          ? "Hide participants"
                          : "View participants"}
                      </span>

                      <span className="ml-auto text-xs opacity-80">
                        {showParticipants ? "▼" : "▶"}
                      </span>
                    </button>

                    {showParticipants && (
                      <div className="meta mt-2">
                        <div>
                          client:{" "}
                          <span className="mono">
                            {escrowClient.slice(0, 6)}...
                            {escrowClient.slice(-4)}
                          </span>
                        </div>

                        <div>
                          freelancer:{" "}
                          <span className="mono">
                            {escrowFreelancer.slice(0, 6)}...
                            {escrowFreelancer.slice(-4)}
                          </span>
                        </div>

                        <div>
                          oracle:{" "}
                          <span className="mono">
                            {(escrowOracle || "—").slice(0, 6)}...
                            {(escrowOracle || "—").slice(-4)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline */}
                {escrowState !== undefined && (
                  <div>
                    <button
                      onClick={() => setShowTimeline(!showTimeline)}
                      className="
    w-full flex items-center justify-start
    px-4 py-2
    !bg-gray-800/70 hover:!bg-gray-700/90
    !border !border-gray-700
    rounded-md
    text-sm !text-blue-400 hover:!text-white
    transition-all
  "
                    >
                      <span>
                        {showTimeline ? "Hide timeline" : "View timeline"}
                      </span>
                      <span className="ml-auto text-xs opacity-80">
                        {showTimeline ? "▼" : "▶"}
                      </span>
                    </button>

                    {showTimeline && (
                      <div className="meta mt-2 text-sm text-gray-300 leading-relaxed">
                        depositDeadline: {fmtTs(depositDeadline)} <br />
                        startDeadline: {fmtTs(startDeadline)} <br />
                        completionDeadline: {fmtTs(completionDeadline)}
                        <br />
                        revisions: {revisions}/{MAX_REVISIONS.toString()} |
                        {DISPUTE_GRACE === 0n
                          ? "—"
                          : (() => {
                              const secs = Number(DISPUTE_GRACE);
                              if (secs < 3600)
                                return `${Math.round(secs / 60)} minutes`;
                              return `${(secs / 3600).toFixed(2)} hours`;
                            })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Info */}
                <div>
                  <button
                    onClick={() => setShowPaymentInfo(!showPaymentInfo)}
                    className="
    w-full flex items-center justify-start
    px-4 py-2
    !bg-gray-800/70 hover:!bg-gray-700/90
    !border !border-gray-700
    rounded-md
    text-sm !text-blue-400 hover:!text-white
    transition-all
  "
                  >
                    <span>
                      {showPaymentInfo
                        ? "Hide payment info"
                        : "View payment info"}
                    </span>
                    <span className="ml-auto text-xs opacity-80">
                      {showPaymentInfo ? "▼" : "▶"}
                    </span>
                  </button>

                  {showPaymentInfo && (
                    <div className="statusPanel bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-4 shadow-lg mt-2 text-sm">
                      <div>Deposit: {panelDepositDisplay}</div>
                      <div>Fee paid: {panelFeePaidDisplay}</div>
                      <div>Settlement token: {panelSettlementDisplay}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div
              className={`nextStepCard mt-4 p-4 rounded-xl border text-sm sm:text-base transition-all
    ${
      escrowState === 0
        ? "border-blue-500/50 bg-blue-900/20 text-blue-200"
        : escrowState === 1
          ? "border-yellow-500/50 bg-yellow-900/20 text-yellow-200"
          : escrowState === 2 || escrowState === 4
            ? "border-orange-500/50 bg-orange-900/20 text-orange-200"
            : escrowState === 3 || escrowState === 6
              ? "border-green-500/50 bg-green-900/20 text-green-200"
              : escrowState === 5
                ? "border-red-500/50 bg-red-900/20 text-red-200"
                : "border-gray-600 bg-gray-800/50 text-gray-300"
    }
  `}
            >
              <div className="flex items-center gap-2 font-semibold mb-1">
                🧭 <span>Next Step</span>
              </div>

              <div>{nextAction}</div>
            </div>

            {/* ===== Dispute Grace (BNB + Base) ===== */}
            {escrow && escrowState === 5 && (
              <div className="mt-6 bg-gray-800/60 backdrop-blur border border-red-600/30 rounded-xl p-5 shadow-lg">
                <h4 className="sectionHeader text-lg mb-2">⏳ Dispute Grace</h4>

                <div className="mt-2 text-xs text-gray-400">
                  <b>Grace ends:</b>{" "}
                  {graceEndsAt === 0n
                    ? "—"
                    : new Date(Number(graceEndsAt) * 1000).toLocaleString()}
                  <div className="mt-1">
                    <b>Status:</b> {graceCountdown}
                  </div>
                  {!canProposeNow && currentChain.id === 84532 && (
                    <div className="mt-2 text-yellow-300">
                      ⏳ You can only propose after the grace period ends
                      (prevents early revert).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== UMA Dispute Panel (Base only) ===== */}
            {escrow && escrowState === 5 && currentChain.id === 84532 && (
              <div className="mt-6 bg-gray-800/60 backdrop-blur border border-yellow-600/40 rounded-xl p-6 shadow-lg">
                <h4 className="sectionHeader text-lg mb-2">⚖️ Dispute (UMA)</h4>

                <div className="text-sm text-gray-300 leading-relaxed">
                  <div>
                    <b>Assertion ID:</b>{" "}
                    {disputeAssertionId ===
                    "0x0000000000000000000000000000000000000000000000000000000000000000"
                      ? "— (not proposed yet)"
                      : `${disputeAssertionId.slice(0, 10)}...${disputeAssertionId.slice(-8)}`}
                  </div>

                  <div className="mt-1">
                    <b>Expiration:</b>{" "}
                    {disputeAssertionExpiration === 0n
                      ? "—"
                      : new Date(
                          Number(disputeAssertionExpiration) * 1000,
                        ).toLocaleString()}
                  </div>

                  {disputeAssertionExpiration > 0n && (
                    <div className="mt-1">
                      <b>Time left:</b> {umaCountdown}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {/* Propose (only if not proposed yet) */}
                  {/* === NEW: Evidence + choose winner (replaces prompt UX) === */}
                  {emptyAssertion && (
                    <>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Evidence link (required)
                        </label>

                        <input
                          value={umaEvidence}
                          onChange={(e) => setUmaEvidence(e.target.value)}
                          placeholder="Paste IPFS / Google Drive / URL"
                          className="fullWidth text-base py-3 px-4"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => proposeUmaResolution(true)}
                          disabled={
                            pendingAction !== null ||
                            !canProposeNow ||
                            !umaEvidence.trim()
                          }
                          className="uma-btn"
                          title={
                            !canProposeNow
                              ? "Wait for dispute grace period to elapse"
                              : !umaEvidence.trim()
                                ? "Evidence link required"
                                : ""
                          }
                        >
                          {pendingAction === "proposeResolution" &&
                          pendingProposeSide === "freelancer" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Proposing...
                            </>
                          ) : (
                            <>🏆 Freelancer wins</>
                          )}
                        </button>

                        <button
                          onClick={() => proposeUmaResolution(false)}
                          disabled={
                            pendingAction !== null ||
                            !canProposeNow ||
                            !umaEvidence.trim()
                          }
                          className="uma-btn"
                          title={
                            !canProposeNow
                              ? "Wait for dispute grace period to elapse"
                              : !umaEvidence.trim()
                                ? "Evidence link required"
                                : ""
                          }
                        >
                          {pendingAction === "proposeResolution" &&
                          pendingProposeSide === "client" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Proposing...
                            </>
                          ) : (
                            <>🏆 Client wins</>
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Finalize (only if proposed already) */}
                  {disputeAssertionId !==
                    "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                    <button
                      onClick={finalizeUmaDispute}
                      disabled={
                        pendingAction !== null ||
                        (disputeAssertionExpiration > 0n &&
                          BigInt(Math.floor(Date.now() / 1000)) <
                            disputeAssertionExpiration)
                      }
                      className="uma-btn uma-btn-finalize"
                    >
                      {pendingAction === "finalizeDispute" ? (
                        <>
                          <FaSyncAlt className="animate-spin" /> Finalizing...
                        </>
                      ) : (
                        <>✅ Finalize / Settle</>
                      )}
                    </button>
                  )}

                  <div className="text-xs text-gray-400">
                    Note: On UMA, settlement happens after the liveness timer
                    unless someone disputes it.
                  </div>
                </div>
              </div>
            )}

            {/* NEW: Visual separation from Next Step banner */}
            {address && !escrow && (
              <>
                <div className="nextStepToCreateSpacer" />

                <div
                  className={`formGroup bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg mt-8 ${
                    pulseSuccess ? "success-pulse" : ""
                  }`}
                >
                  <h4 className="sectionHeader">Create New Escrow</h4>
                  <div className="createEscrowSeparator" />
                  <div className="settingsGrid">
                    <div>
                      <label htmlFor="freelancerAddr">Freelancer Address</label>
                      <br />
                      <input
                        id="freelancerAddr"
                        placeholder="0x..."
                        value={freelancerAddr}
                        onChange={(e) =>
                          setFreelancerAddr(e.target.value.trim())
                        }
                        className="fullWidth text-base py-3 px-4"
                      />
                    </div>
                    <div>
                      <label htmlFor="createSettlement">Settlement Token</label>
                      <br />
                      <select
                        id="createSettlement"
                        value={settlementToken}
                        onChange={(e) =>
                          setSettlementToken(e.target.value as "USDT" | "USDC")
                        }
                        className="fullWidth text-base py-3 px-4"
                      >
                        <option>USDT</option>
                        <option>USDC</option>
                      </select>
                    </div>
                  </div>

                  <div className="buttonGroup">
                    <button
                      onClick={createNewEscrow}
                      disabled={
                        !isValidEthereumAddress(freelancerAddr) ||
                        pendingAction === "createEscrow"
                      }
                      className="
    cta
    flex items-center justify-center gap-3 text-lg
    disabled:opacity-60
    disabled:cursor-not-allowed col-span-full
  "
                    >
                      {pendingAction === "createEscrow" ? (
                        <>
                          <FaSyncAlt className="animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <FaCheckCircle size={24} />
                          Create Escrow
                        </>
                      )}
                    </button>

                    {!isValidEthereumAddress(freelancerAddr) &&
                      freelancerAddr && (
                        <div className="hint invalidHint">
                          Invalid freelancer address
                        </div>
                      )}
                  </div>
                </div>
              </>
            )}

            {showClient &&
              escrowState === 0 &&
              (!tokenApprovedOnce || !clientHasDeposit) && (
                <div className="settingsGrid">
                  <div>
                    <label htmlFor="settlement">Settlement</label>
                    <br />
                    <select
                      id="settlement"
                      value={settlement}
                      onChange={(e) =>
                        handleSettlementChange(
                          e.target.value as "USDT" | "USDC",
                        )
                      }
                    >
                      <option>USDT</option>
                      <option>USDC</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="amount">Amount</label>
                    <br />
                    <input
                      id="amount"
                      placeholder="e.g. 10"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="fullWidth text-base py-3 px-4"
                    />
                  </div>
                </div>
              )}

            {clientHasActions && (
              <div
                className={`mt-8 bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg ${
                  pulseSuccess ? "success-pulse" : ""
                }`}
              >
                <h4 className="sectionHeader text-lg mb-4">Client Actions</h4>

                <div className="actionGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Approve */}
                  {escrowState === 0 &&
                    !tokenApprovedOnce &&
                    (pendingAction === null || pendingAction === "approve") && (
                      <button
                        onClick={approveSpending}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-green-600 text-white shadow-md hover:bg-green-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "approve" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>
                            <FaCheckCircle size={20} /> Approve {settlement}
                          </>
                        )}
                      </button>
                    )}

                  {/* Deposit */}
                  {escrowState === 0 &&
                    tokenApprovedOnce &&
                    !clientHasDeposit &&
                    (pendingAction === null || pendingAction === "deposit") && (
                      <button
                        onClick={depositFn}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "deposit" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>Deposit</>
                        )}
                      </button>
                    )}

                  {/* Pay Fee */}
                  {escrowState === 0 &&
                    clientHasDeposit &&
                    !clientPaidFee &&
                    (pendingAction === null || pendingAction === "payFee") && (
                      <button
                        onClick={payFee}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "payFee" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>
                            Pay Fee ({formatUnits(FEE || 0n, 18)}{" "}
                            {currentChain.id === 97 ? "BNB" : "ETH"})
                          </>
                        )}
                      </button>
                    )}

                  {/* Refund */}
                  {canRefundNoStart &&
                    (pendingAction === null || pendingAction === "refund") && (
                      <button
                        onClick={refundNoStart}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "refund" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>Refund (No Start)</>
                        )}
                      </button>
                    )}

                  {/* Review Phase */}
                  {escrowState === 2 && (
                    <>
                      {(pendingAction === null ||
                        pendingAction === "requestRevision") && (
                        <button
                          onClick={requestRevisionPrompt}
                          disabled={pendingAction !== null}
                          className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                        >
                          {pendingAction === "requestRevision" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Processing...
                            </>
                          ) : (
                            <>Request Revision</>
                          )}
                        </button>
                      )}

                      {(pendingAction === null ||
                        pendingAction === "approveJob") && (
                        <button
                          onClick={approveJob}
                          disabled={pendingAction !== null}
                          className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                        >
                          {pendingAction === "approveJob" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Processing...
                            </>
                          ) : (
                            <>Approve Payment</>
                          )}
                        </button>
                      )}

                      {(pendingAction === null ||
                        pendingAction === "raiseDispute") && (
                        <button
                          onClick={raiseDispute}
                          disabled={pendingAction !== null}
                          className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                        >
                          {pendingAction === "raiseDispute" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Processing...
                            </>
                          ) : (
                            <>Raise Dispute</>
                          )}
                        </button>
                      )}

                      {proofLink}

                      {canRaiseDispute && pendingAction === null && (
                        <div className="hint col-span-full">
                          Use the raise dispute button only if the freelancer is
                          unresponsive, abusive, or violating terms after
                          revision request.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {freelancerHasActions && (
              <div
                className={`mt-8 bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg ${
                  pulseSuccess ? "success-pulse" : ""
                }`}
              >
                <h4 className="sectionHeader text-lg mb-4">
                  Freelancer Actions
                </h4>

                <div className="actionGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Start Job */}
                  {escrowState === 0 &&
                    clientHasDeposit &&
                    clientPaidFee &&
                    (pendingAction === null ||
                      pendingAction === "startJob") && (
                      <button
                        onClick={startJobPrompt}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "startJob" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>Start Job</>
                        )}
                      </button>
                    )}

                  {/* Submit */}
                  {(escrowState === 1 || escrowState === 4) &&
                    (pendingAction === null ||
                      pendingAction === "submitProof") && (
                      <>
                        <button
                          onClick={submitProofPrompt}
                          disabled={pendingAction !== null}
                          className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                        >
                          {pendingAction === "submitProof" ? (
                            <>
                              <FaSyncAlt className="animate-spin" />{" "}
                              Processing...
                            </>
                          ) : (
                            <>Submit Proof</>
                          )}
                        </button>

                        {/* IPFS Guide */}
                        <div className="col-span-full mt-0">
                          <div
                            onClick={() => setShowGuide(!showGuide)}
                            role="button"
                            tabIndex={0}
                            className="flex items-center gap-1 text-sm font-medium text-green-400 hover:text-white cursor-pointer transition-colors select-none"
                          >
                            <span>How to hash your proof on IPFS</span>
                            <span
                              className={`transform transition-transform ${
                                showGuide ? "rotate-180" : ""
                              }`}
                            >
                              ▼
                            </span>
                          </div>

                          {showGuide && (
                            <div className="mt-2 p-4 bg-gray-800/70 rounded-lg text-sm text-gray-300">
                              <ol className="list-decimal list-inside space-y-2">
                                <li>
                                  Sign in on{" "}
                                  <a
                                    href="https://app.pinata.cloud/auth/signin"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                  >
                                    Pinata
                                  </a>
                                  .
                                </li>

                                <li>
                                  Tap the "Add" button to upload your proof
                                  file.
                                </li>

                                <li>
                                  Choose Private or Public upload and complete
                                  it.
                                </li>

                                <li>
                                  Copy the file CID from the Private or Public
                                  tab.
                                </li>

                                <li>
                                  Paste the CID here (with or without ipfs://)
                                  and tap OK.
                                </li>

                                <li>
                                  If your wallet doesn't pop up, check your
                                  extension or mobile app.
                                </li>
                              </ol>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                  {/* Revision message accordion (only in state 4) */}
                  {escrowState === 4 &&
                    revisionMessage &&
                    pendingAction !== "submitProof" && (
                      <div className="col-span-full mt-4">
                        <button
                          onClick={() => setShowRevision(!showRevision)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-left text-sm font-medium transition-all"
                        >
                          <span>View revision message</span>

                          <span
                            className={`transform transition-transform ${
                              showRevision ? "rotate-180" : ""
                            }`}
                          >
                            ▼
                          </span>
                        </button>

                        {showRevision && (
                          <div className="mt-2 p-4 bg-gray-800/70 rounded-lg text-sm text-gray-300">
                            {revisionMessage}
                          </div>
                        )}
                      </div>
                    )}

                  {/* Raise Dispute */}
                  {(escrowState === 2 || escrowState === 4) &&
                    (pendingAction === null ||
                      pendingAction === "raiseDispute") && (
                      <button
                        onClick={raiseDispute}
                        disabled={pendingAction !== null}
                        className="flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed col-span-full"
                      >
                        {pendingAction === "raiseDispute" ? (
                          <>
                            <FaSyncAlt className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>Raise Dispute</>
                        )}
                      </button>
                    )}
                </div>
              </div>
            )}

            {/* ===== Completed: Share on X (Client + Freelancer) ===== */}
            {escrow &&
              isEscrowFinished &&
              pendingAction === null &&
              (role === "client" || role === "freelancer") && (
                <div className="mt-8 bg-gray-800/60 backdrop-blur border border-green-600/40 rounded-xl p-6 shadow-lg">
                  <h4 className="sectionHeader text-lg mb-2">
                    🎉 Escrow Completed
                  </h4>

                  <div className="text-sm text-gray-300">
                    Payment has been settled successfully. Share your milestone
                    👇
                  </div>

                  <button
                    onClick={() => {
                      const isClient = role === "client";
                      const chainName = CHAIN_CONFIG[currentChain.id].chainName;

                      const text = encodeURIComponent(
                        isClient
                          ? `✅ Just completed a freelance payment on @AfriLanceHQ (${chainName}) using decentralized stablecoin escrow.\n\nClients: secure your gigs → https://testnet.afrilance.xyz`
                          : `✅ Just got paid on @AfriLanceHQ (${chainName}) using decentralized stablecoin escrow.\n\nFreelancers: work with confidence → https://testnet.afrilance.xyz`,
                      );

                      const url = `https://x.com/intent/post?text=${text}`;
                      window.open(url, "_blank", "width=600,height=400");
                    }}
                    className="ui-btn mt-4 flex items-center justify-center gap-3 py-4 text-lg font-semibold rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 hover:shadow-xl transition-all w-full"
                  >
                    <FaXTwitter size={22} /> Share on X
                  </button>
                </div>
              )}

            {role === "unknown" && escrow && (
              <div className="hint">
                You are not the client, freelancer, or oracle for this escrow.
                Actions are hidden.
              </div>
            )}

            <div className="statusText" role="status" aria-live="polite">
              <b>Status:</b> {status}
            </div>
          </>
        ) : (
          <div className="mt-12"></div>
        )}

        {activeTab === "myescrows" && (
          <div className="mt-12">
            {historyLoading && (
              <div className="text-center py-12">
                <FaSyncAlt className="animate-spin mx-auto text-4xl text-gray-400" />
                <p className="mt-4 text-gray-400">
                  Loading your escrow history...
                </p>
              </div>
            )}

            {historyError && (
              <div className="text-center py-12 text-red-400">
                {historyError}
              </div>
            )}

            {!historyLoading && !historyError && myEscrows.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No escrows found for this wallet.
                <p className="text-sm mt-4">Create one on the Dashboard tab!</p>
              </div>
            )}

            {myEscrows.length > 0 && (
              <>
                <div className="space-y-4">
                  {myEscrows
                    .slice(currentPage * 7, (currentPage + 1) * 7)
                    .map((e) => (
                      <div
                        key={e.escrow}
                        onClick={() => {
                          if (e.isActive) {
                            setEscrow(e.escrow);
                            setActiveTab("dashboard");
                            toast.success("Escrow loaded!");
                          }
                        }}
                        className={`bg-gray-800/60 backdrop-blur border border-gray-700 rounded-xl p-4 shadow-md transition-all ${
                          e.isActive
                            ? "hover:shadow-lg hover:border-green-600/50 cursor-pointer"
                            : "opacity-70 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="mono text-sm font-medium break-all text-gray-200">
                              {e.escrow.slice(0, 8)}...{e.escrow.slice(-6)}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Client: {e.client?.slice(0, 6)}...
                              {e.client?.slice(-4)} | Freelancer:{" "}
                              {e.freelancer?.slice(0, 6)}...
                              {e.freelancer?.slice(-4)}
                            </div>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              e.isActive
                                ? "bg-green-600/80 text-green-100"
                                : "bg-gray-600 text-gray-300"
                            }`}
                          >
                            {e.stateLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                {myEscrows.length > 7 && (
                  <div className="flex justify-center items-center gap-8 mt-10">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(0, currentPage - 1))
                      }
                      disabled={currentPage === 0}
                      className="px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      ← Previous
                    </button>

                    <span className="text-gray-400 font-medium">
                      Page {currentPage + 1} of{" "}
                      {Math.ceil(myEscrows.length / 7)}
                    </span>

                    <button
                      onClick={() =>
                        setCurrentPage(
                          Math.min(
                            Math.ceil(myEscrows.length / 7) - 1,
                            currentPage + 1,
                          ),
                        )
                      }
                      disabled={
                        currentPage >= Math.ceil(myEscrows.length / 7) - 1
                      }
                      className="px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="mt-26 pb-8 text-center">
        <p className="text-gray-500 text-sm mb-4">Connect with us</p>
        <div className="flex justify-center gap-8 flex-wrap">
          <a
            href="https://t.me/AfriLance_bot"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition"
          >
            <FaTelegramPlane size={32} />
            <p className="text-xs mt-1 text-gray-400">Bot</p>
          </a>

          <a
            href="https://t.me/AfriLanceCommunity"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition"
          >
            <FaTelegramPlane size={32} />
            <p className="text-xs mt-1 text-gray-400">Group</p>
          </a>

          <a
            href="https://x.com/AfriLanceHQ"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300 transition"
          >
            <FaTwitter size={32} />
            <p className="text-xs mt-1 text-gray-400">X</p>
          </a>

          <a
            href="https://www.youtube.com/@AfrilanceTube"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-400 hover:text-red-300 transition"
          >
            <FaYoutube size={32} />
            <p className="text-xs mt-1 text-gray-400">YouTube</p>
          </a>

          <a
            href="https://github.com/shihtzu299/afrilanceFrontend-Test"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-white transition"
          >
            <FaGithub size={32} />
            <p className="text-xs mt-1 text-gray-400">GitHub</p>
          </a>
        </div>

        <p className="text-gray-600 text-xs mt-4">support@afrilance.xyz</p>

        <p className="text-gray-600 text-xs mt-8">
          © 2025 AfriLance - Empowering African Freelancers
        </p>
      </footer>
    </div>
  );
}
