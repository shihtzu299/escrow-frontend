/* src/App.tsx */
import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import './App.css';

import EthereumProvider from '@walletconnect/ethereum-provider';
import {
  Address,
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits
} from 'viem';
import { bsc } from 'viem/chains';

import factoryAbi from './abis/ForjeEscrowFactory.json';
import escrowAbi from './abis/ForjeGigEscrow.json';

// ===== env =====
const env = (import.meta as any).env as Record<string, string>;
const RPC  = env.VITE_RPC_URL as string;
const FACTORY = env.VITE_FACTORY as Address;
const USDT = env.VITE_USDT as Address;
const USDC = env.VITE_USDC as Address;
const WC_ID = env.VITE_WC_PROJECT_ID as string;
const WALLET_DEEPLINK = (env.VITE_WALLET_DEEPLINK || '') as string;
const BOT_ORACLE_ADDRESS = import.meta.env.VITE_BOT_ORACLE as Address;

// ===== minimal ERC20 ABI =====
const erc20Abi = [
  { type:'function', name:'decimals', stateMutability:'view', inputs:[], outputs:[{type:'uint8'}] },
  { type:'function', name:'approve',  stateMutability:'nonpayable', inputs:[{type:'address'},{type:'uint256'}], outputs:[{type:'bool'}] },
  { type:'function', name:'balanceOf',stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] }
] as const;

type Role = 'client' | 'freelancer' | 'oracle' | 'unknown' | 'unset';

const STATE_LABEL: Record<number, string> = {
  0: 'Funding',
  1: 'Started',
  2: 'Submitted',
  3: 'Approved',
  4: 'Revised',
  5: 'Disputed',
  6: 'Resolved'
};

const BSC_MAINNET_HEX = '0x38'; // 56
const BSC_MAINNET_PARAMS = {
  chainId: BSC_MAINNET_HEX,
  chainName: 'BNB Smart Chain Mainnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: [RPC || 'https://bsc-dataseed.bnbchain.org'],
  blockExplorerUrls: ['https://bscscan.com']
};

const lower = (x?: string) => (x || '').toLowerCase();
const now = () => BigInt(Math.floor(Date.now() / 1000));
const normalizeChainId = (id: any): string => {
  if (id === null || id === undefined) return 'unknown';
  if (typeof id === 'string') {
    if (id.startsWith('0x')) return id.toLowerCase();
    const n = Number(id);
    if (!Number.isNaN(n)) return '0x' + n.toString(16);
    return 'unknown';
  }
  if (typeof id === 'number') return '0x' + id.toString(16);
  return 'unknown';
};
const fmtTs = (ts: bigint) => {
  if (!ts || ts === 0n) return '—';
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
  if (cleaned.startsWith('ipfs://')) {
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
  const [pub, setPub] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null); // Raw provider (ethereum or WC)
  const [isWalletConnect, setIsWalletConnect] = useState(false);
  const [wc, setWc] = useState<any>(null); // Only for WC
  const [freelancerAddr, setFreelancerAddr] = useState('');
  const [settlementToken, setSettlementToken] = useState<'USDT'|'USDC'>('USDT');

  // escrow + ui
  const [escrow, setEscrow] = useState<Address>();
  const [settlement, setSettlement] = useState<'USDT'|'USDC'>('USDT');
  const [amount, setAmount] = useState('0');
  const [status, setStatus] = useState<string>('Connect your wallet');

  // on-chain snapshot
  const [role, setRole] = useState<Role>('unset');
  const [escrowClient, setEscrowClient] = useState<Address>();
  const [escrowFreelancer, setEscrowFreelancer] = useState<Address>();
  const [escrowOracle, setEscrowOracle] = useState<Address>();
  const [escrowToken, setEscrowToken] = useState<Address>();
  const [escrowState, setEscrowState] = useState<number>();
  const [depositAmount, setDepositAmount] = useState<bigint>(0n);
  const [escrowTokenDecimals, setEscrowTokenDecimals] = useState<number | undefined>(undefined);

  // deadlines & meta
  const [depositDeadline, setDepositDeadline] = useState<bigint>(0n);
  const [startDeadline, setStartDeadline] = useState<bigint>(0n);
  const [completionDeadline, setCompletionDeadline] = useState<bigint>(0n);
  const [revisions, setRevisions] = useState<number>(0);
  const [MAX_REVISIONS, setMAX_REVISIONS] = useState<bigint>(2n);
  const [DISPUTE_GRACE, setDISPUTE_GRACE] = useState<bigint>(7n * 24n * 60n * 60n);
  const [disputeStart, setDisputeStart] = useState<bigint>(0n);
  const [BNB_FEE, setBNB_FEE] = useState<bigint>(0n);

  // extras
  const [escrowBnbBalance, setEscrowBnbBalance] = useState<bigint>(0n);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [tokenApprovedOnce, setTokenApprovedOnce] = useState(false);
  const [chainId, setChainId] = useState<string>('unknown');

  // ====== ENHANCEMENT: escrow token auto-lock ======
  const escrowTokenSymbol = useMemo<'USDT' | 'USDC' | null>(() => {
    if (!escrowToken) return null;
    if (lower(escrowToken) === lower(USDT)) return 'USDT';
    if (lower(escrowToken) === lower(USDC)) return 'USDC';
    return null;
  }, [escrowToken]);

  useEffect(() => {
    if (escrowTokenSymbol) setSettlement(escrowTokenSymbol);
  }, [escrowTokenSymbol]);

  const handleEscrowChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setEscrow(undefined);
      resetEscrowData();
      setFreelancerAddr('');  // Clear create form
      return;
    }
    if (isValidEthereumAddress(trimmed)) {
      setEscrow(trimmed as Address);
    } else {
      setEscrow(undefined);
      resetEscrowData();
      alert('Invalid escrow address.\nPlease enter a valid 0x Ethereum address (42 characters).');
    }
  };

  // NEW: Reset all escrow data when address cleared
  const resetEscrowData = () => {
    setEscrowClient(undefined);
    setEscrowFreelancer(undefined);
    setEscrowOracle(undefined);
    setEscrowToken(undefined);
    setEscrowState(undefined);
    setDepositAmount(0n);
    setEscrowTokenDecimals(undefined);
    setDepositDeadline(0n);
    setStartDeadline(0n);
    setCompletionDeadline(0n);
    setRevisions(0);
    setMAX_REVISIONS(2n);
    setDISPUTE_GRACE(7n * 24n * 60n * 60n);
    setDisputeStart(0n);
    setBNB_FEE(0n);
    setEscrowBnbBalance(0n);
    setTokenApprovedOnce(false);
    setRole('unset');
    setStatus('Connect your wallet');
  };

  // ====== ENHANCEMENT: prevent wrong token selection ======
  const handleSettlementChange = (newToken: 'USDT' | 'USDC') => {
    if (escrowTokenSymbol && escrowTokenSymbol !== newToken) {
      alert(`This escrow only accepts ${escrowTokenSymbol}.\nYou cannot change the settlement token.`);
      setSettlement(escrowTokenSymbol);
      return;
    }
    setSettlement(newToken);
  };

  // ===== boot =====
  useEffect(() => { setPub(createPublicClient({ chain: bsc, transport: http(RPC) })); }, []);
  useEffect(() => { setTokenApprovedOnce(false); }, [escrow]);

  // ===== connect / disconnect =====
  const connect = async () => {
    try {
      setStatus('Connecting wallet...');
      let rawProvider: any;

      if (window.ethereum) {
        rawProvider = window.ethereum;
        setIsWalletConnect(false);
        await rawProvider.request({ method: 'eth_requestAccounts' });
      } else {
        // Fallback to WalletConnect
        const wcProvider = await EthereumProvider.init({
          projectId: WC_ID,
          chains: [bsc.id],
          showQrModal: true
        });
        await wcProvider.enable();
        rawProvider = wcProvider;
        setWc(wcProvider);
        setIsWalletConnect(true);
      }

      setProvider(rawProvider);

      // Events
      rawProvider.on('chainChanged', (cid: any) => setChainId(normalizeChainId(cid)));
      rawProvider.on('accountsChanged', (accs: string[]) => {
        if (Array.isArray(accs) && accs[0]) {
          setAddress(accs[0] as Address);
        } else {
          hardDisconnect();
        }
      });

      await ensureBsc(rawProvider);

      const cid = await rawProvider.request({ method: 'eth_chainId' });
      setChainId(normalizeChainId(cid));

      const accounts = await rawProvider.request({ method: 'eth_accounts' });
      const addr = accounts[0] as Address;
      if (!addr) throw new Error('No accounts found');

      const client = createWalletClient({
        chain: bsc,
        transport: custom(rawProvider),
        account: addr
      });

      setWallet(client);
      setAddress(addr);
      setStatus(`Connected: ${addr}`);
    } catch (e: any) {
      setStatus(`Connect failed: ${e?.message || e}`);
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
          if (k && (k.startsWith('wc@') || k.startsWith('walletconnect'))) store.removeItem(k);
        }
      };
      nuke(localStorage); nuke(sessionStorage);
    } finally {
      setAddress(undefined); setWallet(undefined); setWc(null); setProvider(null); setIsWalletConnect(false);
      setRole('unset'); setChainId('unknown');
      setEscrow(undefined); setEscrowClient(undefined); setEscrowFreelancer(undefined); setEscrowOracle(undefined);
      setEscrowToken(undefined); setEscrowState(undefined); setDepositAmount(0n); setEscrowBnbBalance(0n);
      setTokenApprovedOnce(false); setEscrowTokenDecimals(undefined);
      setStatus('Disconnected. Connect your wallet again.');
    }
  };

  useEffect(() => {
    const check = async () => {
      if (provider) {
        const cid = await provider.request({ method: 'eth_chainId' }).catch(() => 'unknown');
        setChainId(normalizeChainId(cid));
      }
    };
    check();
    const h = setInterval(check, 5000);
    return () => clearInterval(h);
  }, [provider]);

  const tokenAddr = useMemo(() => settlement === 'USDT' ? USDT : USDC, [settlement]);
  const readDecimals = async (token: Address) => await pub!.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }) as number;

  const ensureBsc = async (prov: any) => {
    const currentChain = await prov.request({ method: 'eth_chainId' }).catch(() => 'unknown');
    if (normalizeChainId(currentChain) === BSC_MAINNET_HEX) return;
    try {
      await prov.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_MAINNET_HEX }] });
    } catch (err: any) {
      if (err.code === 4902 || err.code === -32601) { // Chain not added or method not supported
        await prov.request({ method: 'wallet_addEthereumChain', params: [BSC_MAINNET_PARAMS] });
        await prov.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_MAINNET_HEX }] });
      } else {
        throw err;
      }
    }
    setChainId(normalizeChainId(await prov.request({ method: 'eth_chainId' }).catch(() => 'unknown')));
  };

  const clientHasDeposit = depositAmount > 0n;
  const clientPaidFee = escrowBnbBalance >= BNB_FEE && BNB_FEE > 0n;

  const canClientApproveToken = escrowState === 0 && !tokenApprovedOnce;
  const canClientDeposit      = escrowState === 0 && tokenApprovedOnce && !clientHasDeposit;
  const canClientPayFee       = escrowState === 0 && clientHasDeposit && !clientPaidFee;

  const canClientApprove = escrowState === 2;
  const canClientRevise  = escrowState === 2;
  const canRaiseDispute  = escrowState === 2 || escrowState === 4;
  const canRefundNoStart = escrowState === 0 && now() > startDeadline;

  const canFreelancerStart  = escrowState === 0 && now() <= startDeadline && clientHasDeposit && clientPaidFee;
  const canFreelancerSubmit = (escrowState === 1 || escrowState === 4) && now() <= completionDeadline;
  const canOracleSettle = escrowState === 5 && (now() >= (disputeStart + DISPUTE_GRACE));

  const roleLabel: Record<Role, string> = { client: 'Client', freelancer: 'Freelancer', oracle: 'Oracle', unknown: 'Unknown (not part of this escrow)', unset: '—' };

  const refreshRoleAndState = async (esc?: Address, acct?: Address) => {
    if (!pub || !esc) { setRole('unset'); return; }
    try {
      const [
        cAddr, fAddr, oAddr, st, dep, stoken, bnbFee,
        depDL, startDL, compDL, revs, maxRevs, dispStart, dispGrace
      ] = await Promise.all([
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'client' }) as Promise<Address>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'freelancer' }) as Promise<Address>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'oracle' }) as Promise<Address>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'state' }),
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'depositAmount' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'settlementToken' }) as Promise<Address>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'BNB_FEE' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'depositDeadline' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'startDeadline' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'completionDeadline' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'revisions' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'MAX_REVISIONS' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'disputeStart' }) as Promise<bigint>,
        pub.readContract({ address: esc, abi: escrowAbi as any, functionName: 'DISPUTE_GRACE' }) as Promise<bigint>
      ]);

      setEscrowClient(cAddr); setEscrowFreelancer(fAddr); setEscrowOracle(oAddr); setEscrowState(Number(st));
      setDepositAmount(dep); setEscrowToken(stoken); setBNB_FEE(bnbFee);
      setDepositDeadline(depDL); setStartDeadline(startDL); setCompletionDeadline(compDL);
      setRevisions(Number(revs)); setMAX_REVISIONS(maxRevs); setDisputeStart(dispStart); setDISPUTE_GRACE(dispGrace);

      const bal = await pub.getBalance({ address: esc }).catch(() => 0n);
      setEscrowBnbBalance(bal);
      if (dep > 0n) setTokenApprovedOnce(true);

      if (acct) {
        if (lower(acct) === lower(cAddr)) setRole('client');
        else if (lower(acct) === lower(fAddr)) setRole('freelancer');
        else if (lower(acct) === lower(oAddr)) setRole('oracle');
        else setRole('unknown');
      } else setRole('unknown');

      const dec = await readDecimals(stoken).catch(() => 18);
      setEscrowTokenDecimals(dec);

      setStatus(`State=${STATE_LABEL[Number(st)] || st} | Deposit=${formatUnits(dep, dec)} ${escrowTokenSymbol || 'TOKEN'} | Revisions=${revs}/${maxRevs} | Fee=${formatUnits(bnbFee, 18)} BNB`);
    } catch (e: any) {
      setStatus(`Read failed: ${e?.message || e}`);
      setRole('unknown');
    }
  };

  const readStateAll = async () => {
    if (!escrow) { setStatus('Enter an escrow address to read state.'); return; }
    await refreshRoleAndState(escrow, address);
  };

  useEffect(() => { if (escrow) refreshRoleAndState(escrow, address); }, [escrow, address]);

  const tryOpenWallet = () => {
    if (isWalletConnect && wc) {
      const uri = wc?.connector?.uri;
      if (uri) {
        const base = WALLET_DEEPLINK || 'wc:';
        window.open(`${base}${encodeURIComponent(uri)}`, '_blank');
        return;
      }
      if (WALLET_DEEPLINK) {
        window.open(WALLET_DEEPLINK, '_blank');
        return;
      }
    } else if (window.ethereum) {
      window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => {});
    }
  };

  const withPending = async (fn: () => Promise<void>) => {
    setPendingApproval(true);
    if (isWalletConnect) tryOpenWallet();
    try { await fn(); } catch (e: any) { setStatus(`Action failed: ${e?.shortMessage || e?.message || e}`); } finally { setTimeout(() => setPendingApproval(false), 1200); }
  };

  const bscanTx = (hash: string) => `https://bscscan.com/tx/${hash}`;

  // ===== FINAL: Create New Escrow + Auto-Detect & Load =====
  const createNewEscrow = async () => {
    try {
      if (!wallet || !address) throw new Error('Connect your wallet first');
      if (!isValidEthereumAddress(freelancerAddr)) throw new Error('Enter a valid freelancer address');
      if (!BOT_ORACLE_ADDRESS || !isValidEthereumAddress(BOT_ORACLE_ADDRESS)) {
        throw new Error('Bot oracle address not configured');
      }

      const tokenAddr = settlementToken === 'USDT' ? USDT : USDC;

      await ensureBsc(provider);

      setStatus('Creating escrow... Please confirm in wallet');

      const hash = await wallet.writeContract({
        address: FACTORY,
        abi: factoryAbi as any,
        functionName: 'createJob',
        args: [address, freelancerAddr, tokenAddr, BOT_ORACLE_ADDRESS],
        account: address,
      });

      setStatus(`Escrow deploying... Tx: ${hash} (waiting for confirmation)`);

      const receipt = await pub!.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        let newEscrowAddr: Address | null = null;

        const factoryInterface = new ethers.Interface(factoryAbi as any);

        for (const log of receipt.logs) {
          try {
            const parsed = factoryInterface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === 'JobCreated') {
              newEscrowAddr = parsed.args[0] as Address;
              break;
            }
          } catch {
            // Ignore non-matching logs
          }
        }

        if (newEscrowAddr && isValidEthereumAddress(newEscrowAddr)) {
          setEscrow(newEscrowAddr);
          setFreelancerAddr('');
          setSettlementToken('USDT');
          setStatus(`Success! New escrow loaded: ${newEscrowAddr}`);
          await refreshRoleAndState(newEscrowAddr, address);
        } else {
          setStatus(`Success! Tx: ${hash}\nCould not auto-detect address — copy from bscscan and paste above.`);
        }
      } else {
        setStatus('Transaction failed or reverted');
      }
    } catch (e: any) {
      setStatus(`Failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  // ===== client actions =====
  const approveSpending = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can approve token spending');
      await ensureBsc(provider);
      const token = tokenAddr;
      const dec = await readDecimals(token);
      const amt = parseUnits(amount || '0', dec);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: token, abi: erc20Abi, functionName: 'approve',
          args: [escrow!, amt], account: address
        });
        setStatus(`Approve tx: ${hash} (${bscanTx(hash)})`);
        setTokenApprovedOnce(true);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Approve failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const depositFn = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can deposit');
      if (escrowState !== 0) throw new Error('Deposit allowed only in Funding state');
      await ensureBsc(provider);
      const token = tokenAddr;
      const dec = await readDecimals(token);
      const amt = parseUnits(amount || '0', dec);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'deposit',
          args: [amt], account: address
        });
        setStatus(`Deposit tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Deposit failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const payFee = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can pay fee');
      if (escrowState !== 0) throw new Error('Fee allowed only in Funding state');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'payFee',
          args: [], account: address, value: BNB_FEE
        });
        setStatus(`PayFee tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`PayFee failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const requestRevision = async (msg: string) => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can request revision');
      if (escrowState !== 2) throw new Error('Revision only after proof is Submitted');
      if (revisions >= Number(MAX_REVISIONS)) throw new Error('Max revisions reached');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'requestRevision',
          args: [msg], account: address
        });
        setStatus(`RequestRevision tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`RequestRevision failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const approveJob = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can approve');
      if (escrowState !== 2) throw new Error('Approve only when Submitted');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'approve',
          args: [], account: address
        });
        setStatus(`Approve tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Approve failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const raiseDispute = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client' && role !== 'freelancer') {
        throw new Error('Only the client or freelancer can raise a dispute');
      }
      if (!canRaiseDispute) throw new Error('Dispute allowed only in Submitted or Revised state');
      
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!,
          abi: escrowAbi as any,
          functionName: 'raiseDispute',
          args: [],
          account: address
        });
        setStatus(`Dispute raised: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Raise Dispute failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const refundNoStart = async () => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'client') throw new Error('Only the client can refund-no-start');
      if (!canRefundNoStart) throw new Error('Refund only after start deadline if not started');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'refundNoStart',
          args: [], account: address
        });
        setStatus(`Refund tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Refund failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const startJob = async (days: number) => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'freelancer') throw new Error('Only the freelancer can start the job');
      if (!canFreelancerStart) throw new Error('Start only after client funded deposit + fee, before start deadline');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'startJob',
          args: [BigInt(days)], account: address
        });
        setStatus(`StartJob tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`StartJob failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  // ENHANCED: strict CID validation + auto-prefix + trim
  const submitProof = async (rawInput: string) => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'freelancer') throw new Error('Only the freelancer can submit proof');
      if (!canFreelancerSubmit) throw new Error('Submit only in Started/Revised before completion deadline');

      const cid = normalizeAndValidateCid(rawInput);
      if (!cid) {
        alert('Invalid IPFS CID!\n\nMust be exactly 46 characters.\n\nCorrect examples:\n• bafybei... (46 chars)\n• ipfs://bafybei...');
        return;
      }

      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'submitProof',
          args: [cid], account: address
        });
        setStatus(`SubmitProof tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`SubmitProof failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const settleDispute = async (freelancerWins: boolean) => {
    try {
      if (!wallet || !address || !escrow) throw new Error('Connect wallet and set escrow');
      if (role !== 'oracle') throw new Error('Only the oracle can settle disputes');
      if (!canOracleSettle) throw new Error('Settle only after grace period in Disputed state');
      await ensureBsc(provider);
      await withPending(async () => {
        const hash = await wallet.writeContract({
          address: escrow!, abi: escrowAbi as any, functionName: 'settleDispute',
          args: [freelancerWins], account: address
        });
        setStatus(`SettleDispute tx: ${hash} (${bscanTx(hash)})`);
        await new Promise(r => setTimeout(r, 4000));
        await refreshRoleAndState(escrow!, address!);
      });
    } catch (e: any) {
      setStatus(`Settle failed: ${e?.shortMessage || e?.message || e}`);
      setPendingApproval(false);
    }
  };

  const showClient = role === 'client';
  const showFreelancer = role === 'freelancer';
  const showOracle = role === 'oracle';
  const wrongNet = normalizeChainId(chainId) !== BSC_MAINNET_HEX && chainId !== 'unknown';

  const nextAction = (() => {
    if (escrowState === undefined) return 'Connect & load an escrow';
    if (role === 'client') {
      if (escrowState === 0) {
        if (!clientHasDeposit && !tokenApprovedOnce) return 'Step 1: Approve token';
        if (!clientHasDeposit && tokenApprovedOnce) return 'Step 2: Deposit tokens';
        if (!clientPaidFee) return 'Step 3: Pay fee';
        return 'Wait for freelancer to start';
      }
      if (escrowState === 1) return 'Wait for freelancer to submit proof';
      if (escrowState === 2) return 'Review proof → Approve or Request Revision (or Raise Dispute)';
      if (escrowState === 4) return 'Wait for freelancer to resubmit proof';
      if (escrowState === 5) return 'Disputed: wait for oracle to settle';
      if (escrowState === 6) return 'Resolved: no further actions';
    }
    if (role === 'freelancer') {
      if (escrowState === 0) {
        if (!clientHasDeposit) return 'Wait for client to deposit & pay fee';
        if (!clientPaidFee) return 'Wait for client to pay fee';
        return 'Ready to start job';
      }
      if (escrowState === 1) return 'Work in progress — Submit Proof before deadline';
      if (escrowState === 2) return 'Wait for client’s decision';
      if (escrowState === 4) return 'Revision requested — Submit Proof again';
      if (escrowState === 5) return 'Disputed: wait for oracle to settle';
      if (escrowState === 6) return 'Resolved: no further actions';
    }
    if (role === 'oracle') {
      if (escrowState === 5) return 'After grace period, press a Settle button';
      return 'No action for oracle';
    }
    return 'You are not assigned to this escrow';
  })();

  const startJobPrompt = async () => {
    const daysStr = prompt('How many days will you take to complete this job? (whole number)');
    if (!daysStr) return;
    const days = Number(daysStr);
    if (Number.isNaN(days) || days <= 0) return alert('Enter a valid number of days');
    await startJob(days);
  };

  const submitProofPrompt = async () => {
    const input = prompt('Paste your IPFS CID (with or without ipfs:// prefix)');
    if (!input) return;

    const cid = normalizeAndValidateCid(input);
    if (!cid) {
      alert('Invalid CID!\n\nMust be exactly 59 characters.\n\nCorrect examples:\n• bafybei...\n• ipfs://bafybei...');
      return;
    }

    await submitProof(cid);
  };

  const requestRevisionPrompt = async () => {
    const msg = prompt('Enter revision note (plain text)');
    if (!msg) return;
    await requestRevision(msg);
  };

  const panelShouldShow = !!escrow;

  const panelDepositDisplay = (() => {
    if (!panelShouldShow || !address || (role !== 'client' && role !== 'freelancer' && role !== 'oracle')) return '—';
    return depositAmount > 0n ? `${formatUnits(depositAmount, escrowTokenDecimals ?? 18)} ${escrowTokenSymbol || 'TOKEN'}` : 'No';
  })();

  const panelFeePaidDisplay = (() => {
    if (!panelShouldShow || !address || (role !== 'client' && role !== 'freelancer' && role !== 'oracle')) return '—';
    return (escrowBnbBalance >= BNB_FEE && BNB_FEE > 0n) ? 'Yes' : 'No';
  })();

  const panelSettlementDisplay = (() => {
    if (!panelShouldShow || !address) return 'USDT / USDC';
    return escrowTokenSymbol || '—';
  })();

  return (
    <div className="container" role="application" aria-label="Forje App">
      <div className="bgBlockchain" aria-hidden="true" />

      <header className="topBar">
        {!address ? (
          <button className="cta" onClick={connect}>Connect Wallet</button>
        ) : (
          <div className="topButtons">
            <div className="addrCol">
              <div className="smallText">Connected</div>
              <div className="mono small">{address}</div>
              <div className="smallText">Role: <b>{roleLabel[role]}</b></div>
              <div className="smallText">
                Network:&nbsp;
                {chainId === 'unknown' ? '—' : (!wrongNet ? '🟢 BSC' : '🔴 Wrong Network')}
              </div>
            </div>
            <div className="buttonsStack">
              <button className="danger" onClick={hardDisconnect}>Disconnect</button>
              {wrongNet && <button className="tiny" onClick={() => ensureBsc(provider)}>Switch to BSC</button>}
            </div>
          </div>
        )}
      </header>

      <main className="main">
        <h3>Forje Gigs</h3>

        <div className="formGroup">
          <label htmlFor="escrowAddress">Escrow Address</label>
          <input
            id="escrowAddress"
            placeholder="0x..."
            value={escrow || ''}
            onChange={e => handleEscrowChange(e.target.value)}
            className="fullWidth"
          />
          <div className="buttonGroup">
            <button onClick={readStateAll}>Refresh Status</button>
          </div>

          {escrowClient && escrowFreelancer && (
            <div className="meta">
              <div>client: <span className="mono">{escrowClient}</span></div>
              <div>freelancer: <span className="mono">{escrowFreelancer}</span></div>
              <div>oracle: <span className="mono">{escrowOracle}</span></div>
            </div>
          )}

          {escrowState !== undefined && (
            <div className="meta">
              depositDeadline: {fmtTs(depositDeadline)} |
              startDeadline: {fmtTs(startDeadline)} |
              completionDeadline: {fmtTs(completionDeadline)}<br/>
              revisions: {revisions}/{MAX_REVISIONS.toString()} |
              disputeGrace: {DISPUTE_GRACE === 0n ? '—' : `${Number(DISPUTE_GRACE)/86400} days`} |
              disputeStart: {fmtTs(disputeStart)}
            </div>
          )}
        </div>

        <div className="banner">
          <b>Next Step:</b> {nextAction}
        </div>
        
        {/* NEW: Visual separation from Next Step banner */}
        {address && !escrow && (
          <>
            <div className="nextStepToCreateSpacer" />
            
            <div className="formGroup">
              <h4 className="sectionHeader">Create New Escrow</h4>
              <div className="createEscrowSeparator" />
              <div className="settingsGrid">
                <div>
                  <label htmlFor="freelancerAddr">Freelancer Address</label><br/>
                  <input
                    id="freelancerAddr"
                    placeholder="0x..."
                    value={freelancerAddr}
                    onChange={e => setFreelancerAddr(e.target.value.trim())}
                    className="fullWidth"
                  />
                </div>
                <div>
                  <label htmlFor="createSettlement">Settlement Token</label><br/>
                  <select
                    id="createSettlement"
                    value={settlementToken}
                    onChange={e => setSettlementToken(e.target.value as 'USDT'|'USDC')}
                  >
                    <option>USDT</option>
                    <option>USDC</option>
                  </select>
                </div>
              </div>
              <div className="buttonGroup">
                <button 
                  onClick={createNewEscrow}
                  disabled={!isValidEthereumAddress(freelancerAddr) || pendingApproval}
                  className="cta"
                >
                  Forge Escrow
                </button>
                {!isValidEthereumAddress(freelancerAddr) && freelancerAddr && (
                  <div className="hint invalidHint">
                    Invalid freelancer address
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {showClient && (!clientHasDeposit || !clientPaidFee) && (
          <div className="settingsGrid">
            <div>
              <label htmlFor="settlement">Settlement</label><br/>
              <select id="settlement" value={settlement} onChange={e => handleSettlementChange(e.target.value as 'USDT'|'USDC')}>
                <option>USDT</option>
                <option>USDC</option>
              </select>
            </div>
            <div>
              <label htmlFor="amount">Amount</label><br/>
              <input id="amount" placeholder="e.g. 10" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
        )}

        {panelShouldShow && (
          <div className="statusPanel">
            <div>Deposit: {panelDepositDisplay}</div>
            <div>BNB fee paid: {panelFeePaidDisplay}</div>
            <div>Settlement token: {panelSettlementDisplay}</div>
          </div>
        )}

        {showClient && (
          <>
            <h4 className="sectionHeader">Client Actions</h4>
            <div className="actionGrid">
              <button disabled={!canClientApproveToken} onClick={approveSpending}>Approve {settlement}</button>
              <button disabled={!canClientDeposit} onClick={depositFn}>Deposit</button>
              <button disabled={!canClientPayFee} onClick={payFee}>Pay Fee ({formatUnits(BNB_FEE || 0n, 18)} BNB)</button>
              <button disabled={!canRefundNoStart} onClick={refundNoStart}>Refund (No Start)</button>
              <button disabled={!canClientRevise} onClick={requestRevisionPrompt}>Request Revision</button>
              <button disabled={!canClientApprove} onClick={approveJob}>Approve (release fund)</button>
              <div>
                <button 
                  className="danger" 
                  disabled={!canRaiseDispute} 
                  onClick={raiseDispute}
                >
                  Raise Dispute
                </button>
                {canRaiseDispute && (
                  <div className="hint">
                    Use the raise dispute button only if the freelancer is unresponsive, abusive, or violating terms after revision request.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {showFreelancer && (
          <>
            <h4 className="sectionHeader">Freelancer Actions</h4>
            <div className="actionGrid">
              <div>
                <button disabled={!canFreelancerStart} onClick={startJobPrompt}>Start Job</button>
                {escrowState === 0 && (!clientHasDeposit || !clientPaidFee) && (
                  <div className="hint">Start Job is disabled until the client deposits and pays the fee.</div>
                )}
              </div>

              <div>
                <button disabled={!canFreelancerSubmit} onClick={submitProofPrompt}>Submit Proof</button>
                {canFreelancerSubmit && (
                  <div className="hint">
                    Follow this guide for the IPFS Hashing of your job proof for submission:
                    <ol className="ipfsGuideList">
                      <li>Sign in on <a href="https://app.pinata.cloud/auth/signin" target="_blank" rel="noopener noreferrer">Pinata</a>.</li>
                      <li>Tap the "Add" button to upload your proof file for hashing.</li>
                      <li>Choose Private or Public upload and get it uploaded.</li>
                      <li>Copy the file CID from the Private or Public tab.</li>
                      <li>Paste the CID here (with or without ipfs://) and tap OK.</li>
                      <li>If your wallet doesn't pop up, check your extension or app.</li>
                    </ol>
                  </div>
                )}
              </div>

              <div>
                <button 
                  className="danger" 
                  disabled={!canRaiseDispute} 
                  onClick={raiseDispute}
                >
                  Raise Dispute
                </button>
                {canRaiseDispute && (
                  <div className="hint">
                    Use the raise dispute button only if the client is unresponsive, abusive, or violating terms after submission.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {showOracle && (
          <>
            <h4 className="sectionHeader">Oracle Actions</h4>
            <div className="actionGrid">
              <button disabled={!canOracleSettle} onClick={() => settleDispute(true)}>Settle: Freelancer Wins</button>
              <button disabled={!canOracleSettle} onClick={() => settleDispute(false)}>Settle: Client Wins</button>
            </div>
          </>
        )}

        {role === 'unknown' && (
          <div className="hint">
            You are not the client, freelancer, or oracle for this escrow. Actions are hidden.
          </div>
        )}

        <div className="statusText" role="status" aria-live="polite">
          <b>Status:</b> {status}
        </div>
      </main>
    </div>
  );
}