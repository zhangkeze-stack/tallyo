import { createWalletClient, custom, parseUnits } from "viem";
import { monadTestnet, MUSD_ADDRESS, MUSD_ABI } from "./chain";

// 用 Privy 钱包，把 amount 个 mUSD 转给 toAddress，返回交易哈希
export async function sendMusd(privyWallet, toAddress, amount) {
  // 1. 从 Privy 钱包拿到以太坊 provider
  const provider = await privyWallet.getEthereumProvider();

  // 2. 确保钱包连在 Monad 测试网上
  await privyWallet.switchChain(monadTestnet.id);

  // 3. 用这个 provider 构造 viem 的 walletClient
  const walletClient = createWalletClient({
    account: privyWallet.address,
    chain: monadTestnet,
    transport: custom(provider),
  });

  // 4. 发起 mUSD 的 transfer 调用（mUSD 是 18 位小数）
  const hash = await walletClient.writeContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "transfer",
    args: [toAddress, parseUnits(String(amount), 18)],
  });

  return hash;
}

// 查某地址的 mUSD 余额（返回人类可读数字，如 "100.00"）
import { createPublicClient, http, formatUnits } from "viem";

export async function getMusdBalance(address) {
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });
  const raw = await client.readContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw, 18)).toFixed(2);
}
