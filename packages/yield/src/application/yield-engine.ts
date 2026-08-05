import type { YieldConfig } from "../domain/config";
import { yerr } from "../domain/entities/errors";
import type { CountryCode } from "../domain/entities/country";
import type { PositionLock } from "../domain/entities/lock";
import type { Amount } from "../domain/entities/money";
import { add, lt, mul, sub, toN } from "../domain/lib/decimal";
import type {
  BondPosition,
  BondQuote,
  YieldBalance,
} from "../domain/entities/position";
import type { StablebondCode } from "../domain/entities/stablebond";

export interface AutoParkInput {
  usdcAmount: Amount;
  country: CountryCode;
}

export interface LiquidateInput {
  code: StablebondCode;

  usdcAmount?: Amount;
}

export interface LockInput {
  lockId: string;
  code: StablebondCode;
  tokens: Amount;
  reason?: string;
}

export interface UnlockResult {
  tokensReleased: Amount;
  yieldAccrued: Amount;
}

export interface YieldEngine {
  quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote>;
  autoPark(input: AutoParkInput): Promise<BondPosition>;
  balance(): Promise<YieldBalance[]>;
  liquidate(input: LiquidateInput): Promise<Amount>;
  lock(input: LockInput): Promise<PositionLock>;
  unlock(lockId: string): Promise<UnlockResult>;
}

export function createYieldEngine(cfg: YieldConfig): YieldEngine {
  return new YieldEngineImpl(cfg);
}

class YieldEngineImpl implements YieldEngine {

  private readonly positions = new Map<StablebondCode, string>();
  private readonly locks = new Map<string, PositionLock>();

  constructor(private readonly cfg: YieldConfig) {}

  async quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote> {
    this.assertBond(code);
    return this.cfg.provider.quote(code, usdcAmount);
  }

  async autoPark(input: AutoParkInput): Promise<BondPosition> {
    const code = this.cfg.allocation[input.country];
    if (!code) throw yerr.noAllocationForCountry(input.country);
    this.assertBond(code);

    const position = await this.cfg.provider.swapUsdcToBond(
      input.usdcAmount,
      code,
    );
    this.positions.set(
      code,
      add(this.positions.get(code) ?? "0", position.tokens),
    );
    return position;
  }

  async balance(): Promise<YieldBalance[]> {
    const out: YieldBalance[] = [];
    for (const [code, tokens] of this.positions) {
      if (toN(tokens) <= 0n) continue;
      const nav = await this.cfg.provider.getNav(code);
      const bond = this.cfg.provider.bonds.find((b) => b.code === code);
      out.push({
        code,
        tokens,
        nav: nav.nav,
        fiatValue: mul(tokens, nav.nav),
        fiat: bond?.fiat ?? "USD",
        updatedAt: nav.updatedAt,
      });
    }
    return out;
  }

  async liquidate(input: LiquidateInput): Promise<Amount> {
    this.assertBond(input.code);
    const totalPosition = this.positions.get(input.code) ?? "0";
    const unlockedAvailable = sub(
      totalPosition,
      this.lockedTokensFor(input.code),
    );

    let toLiquidate = unlockedAvailable;
    if (input.usdcAmount !== undefined) {
      const quoteTokens = (
        await this.cfg.provider.quote(input.code, input.usdcAmount)
      ).tokens;
      if (lt(unlockedAvailable, quoteTokens)) {
        throw yerr.insufficientUnlockedBalance(input.code);
      }
      toLiquidate = quoteTokens;
    } else if (toN(unlockedAvailable) <= 0n) {
      return "0";
    }

    const remaining = sub(totalPosition, toLiquidate);
    if (toN(remaining) <= 0n) this.positions.delete(input.code);
    else this.positions.set(input.code, remaining);

    return this.cfg.provider.swapBondToUsdc(toLiquidate, input.code);
  }

  async lock(input: LockInput): Promise<PositionLock> {
    this.assertBond(input.code);
    const totalPosition = this.positions.get(input.code) ?? "0";
    const unlockedAvailable = sub(
      totalPosition,
      this.lockedTokensFor(input.code),
    );
    if (lt(unlockedAvailable, input.tokens)) {
      throw yerr.insufficientBalanceToLock(input.code, input.tokens);
    }

    const nav = await this.cfg.provider.getNav(input.code);
    const lock: PositionLock = {
      lockId: input.lockId,
      code: input.code,
      tokens: input.tokens,
      navAtLock: nav.nav,
      lockedAt: new Date().toISOString(),
      reason: input.reason,
    };
    this.locks.set(input.lockId, lock);
    return lock;
  }

  async unlock(lockId: string): Promise<UnlockResult> {
    const lock = this.locks.get(lockId);
    if (!lock) throw yerr.lockNotFound(lockId);

    const nav = await this.cfg.provider.getNav(lock.code);
    const yieldAccrued = mul(lock.tokens, sub(nav.nav, lock.navAtLock));
    this.locks.delete(lockId);

    return { tokensReleased: lock.tokens, yieldAccrued };
  }

  private lockedTokensFor(code: StablebondCode): Amount {
    let total = "0";
    for (const lock of this.locks.values()) {
      if (lock.code === code) total = add(total, lock.tokens);
    }
    return total;
  }

  private assertBond(code: StablebondCode): void {
    if (!this.cfg.provider.bonds.some((b) => b.code === code))
      throw yerr.unsupportedBond(code);
  }
}
