import type { FreightRivalStyle } from './freightRivals.js';

export const VESSEL_TOKENS = [
  'ONE_APUS',
  'ONE_MAGENTA',
  'GANTRY_CRANE',
  'CONTAINER_TRUCK',
  'FREIGHT_TRAIN',
  'REEFER_TRUCK',
  'PILOT_BOAT',
  'BUNKER_BARGE',
] as const;

export type VesselToken = (typeof VESSEL_TOKENS)[number];

export type TileType =
  | 'GO'
  | 'PORT'
  | 'SERVICE_LINE'
  | 'INFRA'
  | 'TAX'
  | 'CUSTOMS_HOLD'
  | 'FREE_ANCHOR'
  | 'GO_TO_HOLD'
  | 'MARKET_CARD'
  | 'OPS_CARD';

export type LoopGroup =
  | 'INTRA_ASIA'
  | 'MIDDLE_EAST'
  | 'MEDITERRANEAN'
  | 'NORTH_EUROPE'
  | 'TRANS_PACIFIC_WEST'
  | 'TRANS_PACIFIC_EAST'
  | 'LATIN_AMERICA'
  | 'GLOBAL_HUB';

export interface BoardTile {
  id: number;
  code: string;
  name: string;
  type: TileType;
  group?: LoopGroup;
  price?: number;
  rentTiers?: [number, number, number, number, number, number]; // [base, 1c, 2c, 3c, 4c, ONE Innovation]
  buildCost?: number;
  mortgageValue?: number;
  taxAmount?: number;
}

export interface SlotCharterAgreement {
  partnerId: string; // The partner sharing the slot
  active: boolean; // True until a 3rd party triggers the split
}

export interface PropertyState {
  ownerId: string | null;
  containerLevel: number; // 0..4 (Lô Container Magenta), 5 = Siêu tàu ONE Innovation (24.000 TEU)
  isMortgaged: boolean;
  hasGreenFleet?: boolean; // Nâng cấp Tàu Nhiên liệu Xanh (Methanol / Ammonia)
  slotCharter?: SlotCharterAgreement | null; // Cơ chế "As ONE, We Can"
}

export interface SecretMissionCard {
  id: string;
  title: string;
  description: string;
  reward: number;
  isCompleted: boolean;
}

export type GameMode = 'classic' | 'logistics' | 'harbor';
export interface HarborLoadAction { type: 'HARBOR_LOAD'; tileId: number; revision: number }
export interface HarborExportTerms {
  readonly operatorId: string;
  readonly operatorName: string;
  readonly fee: 3 | 6;
}
export interface HarborBookExportAction extends Pick<HarborExportTerms, 'operatorId' | 'fee'> {
  type: 'HARBOR_BOOK_EXPORT';
  tileId: number;
  revision: number;
}
export interface HarborExportBooking {
  action: HarborBookExportAction;
  operatorName: string;
  shortfall: number;
}
export interface HarborManifest {
  originTileId: number;
  exportBooking?: HarborExportTerms;
}
export interface HarborDischargeAction { type: 'HARBOR_DISCHARGE'; tileId: number; revision: number }
export interface HarborPurchaseAction { type: 'HARBOR_BUY_AND_DISCHARGE'; tileId: number; revision: number }
export interface HarborRedeemAction { type: 'HARBOR_REDEEM_AND_DISCHARGE'; tileId: number; revision: number }
export interface HarborRentReliefAction { type: 'HARBOR_DISCHARGE_FOR_RENT'; tileId: number; revision: number }
export interface HarborFreightQuote {
  playerId: string;
  originTileId: number;
  tileId: number;
  distanceNm: number;
  gross: number;
  carrierNet: number;
  handlingFee: number;
  feePercent: 0 | 25 | 50;
  operatorId: string | null;
  operatorName: string | null;
}
export interface HarborFreightReceipt extends HarborFreightQuote {
  round: number;
  revision: number;
  exportBooking?: HarborExportTerms;
  redemptionCost?: number;
  purchasePrice?: number;
  rentRelief?: Pick<HarborRentRelief, 'rentDue' | 'shortfallAfter'>;
}
export interface HarborRentRelief {
  action: HarborRentReliefAction;
  quote: HarborFreightQuote;
  rentDue: number;
  shortfallAfter: number;
}
export interface HarborRedemption {
  action: HarborRedeemAction;
  quote: HarborFreightQuote;
  redemptionCost: number;
  cashChange: number;
  shortfall: number;
}
export interface HarborPurchase {
  action: HarborPurchaseAction;
  quote: HarborFreightQuote;
  purchasePrice: number;
  cashChange: number;
  shortfall: number;
}
export type HarborFreightOpportunity =
  | { kind: 'load'; action: HarborLoadAction }
  | { kind: 'discharge'; action: HarborDischargeAction; quote: HarborFreightQuote };
export interface HarborFreightState {
  revision: number;
  manifests: Record<string, HarborManifest | null>;
  visits: Record<string, { tileId: number; handled: boolean } | null>;
  lastDelivery: HarborFreightReceipt | null;
}
export type CargoKind = 'laden' | 'empty';
export interface CargoBooking {
  destinationAmendment?: DestinationAmendment;
  reeferDueRound?: number;
  bookingId: number;
  kind: CargoKind;
  originTileId: number;
  destinationTileId: number;
}
export interface FreightQuote { distanceNm: number; reward: number }
export interface DestinationAmendment {
  firstDestinationTileId: number;
  count: number;
  originalQuote: FreightQuote;
}
export interface DeliveryReceipt extends CargoBooking, FreightQuote {
  streetTurn?: true;
  backhaulBonus?: number;
  reeferBonus?: number;
  tileId: number;
  tenderId?: number;
  tenderBonus?: number;
}
export interface BackhaulJob {
  bookingId: number;
  originTileId: number;
  destinationTileId: number;
  offeredRound: number;
  deadlineRound: number;
  status: 'offered' | 'active' | 'fulfilled' | 'expired';
}
export interface BackhaulAccept { type: 'ACCEPT_BACKHAUL'; bookingId: number; revision: number }
export interface VoyageLogEntry {
  bookingId: number;
  playerId: string;
  round: number;
  originTileId: number;
  destinationTileId: number;
  kind: CargoKind;
  distanceNm: number;
  baseFreight: number;
  destinationAmendment?: DestinationAmendment;
  streetTurn?: true;
  reeferBonus?: number;
  tenderBonus?: number;
  backhaulBonus?: number;
}
export interface FreightTender {
  id: number;
  round: number;
  kind: CargoKind;
  destinationTileId: number;
  priorityPlayerId: string;
  bidderIds: string[];
  bidCount: number;
  // The room stores every quote. Client projections include only the viewer's entry.
  bids: Record<string, number>;
}
export interface FreightAward {
  tenderId: number;
  deliveryRound: number;
  playerId: string;
  kind: CargoKind;
  destinationTileId: number;
  amount: number;
}
export interface FreightContract extends FreightAward { status: 'active' | 'fulfilled' | 'expired' }
export interface FreightMarket {
  tender: FreightTender | null;
  contract: FreightContract | null;
  history: FreightContract[];
  bonusEarnings: Record<string, number>;
}
export interface FreightTenderBid { type: 'BID_FREIGHT_TENDER'; tenderId: number; amount: number; revision: number }
export interface FreightTenderWithdrawal { type: 'WITHDRAW_FREIGHT_TENDER_BID'; tenderId: number; revision: number }
export interface PortStock { supply: number; demand: number; empties: number; emptyTarget: number }
export type TruckOperation = 'export' | 'import';
export interface PortTruckCall {
  type: 'CALL_PORT_TRUCK'; tileId: number; operation: TruckOperation; revision: number;
}
export interface TruckScheduleEntry {
  operation: TruckOperation;
  consumed: boolean;
  /** The yard can run this operation now. A captain still needs their own unused call. */
  available: boolean;
  /** Yard stock immediately after advancing this operation alone. */
  after: PortStock;
}
export interface PortTruckSchedule {
  tileId: number;
  scheduledRound: number;
  /** Appointments expiring before this round opens, releasing trucks into the public queue. */
  returningImportTrucks?: number;
  before: PortStock;
  /** Next round's opening yard if no other captain changes the current stock. */
  projected: PortStock;
  operations: TruckScheduleEntry[];
}
export interface EarlyTruckChoice { operation: TruckOperation; after: PortStock; action: PortTruckCall }
export interface ImportTruckReservation { bookingId: number; destinationTileId: number; throughRound: number }
export interface ReserveImportTruckAction {
  type: 'RESERVE_IMPORT_TRUCK'; bookingId: number; destinationTileId: number; revision: number;
}
export interface LogisticsState {
  /** One direct transfer from a dry import to a public export per captain in new freight games. */
  streetTurnAvailable?: Record<string, boolean>;
  /** Ports report public demand; held import trucks are recorded separately by captain. */
  importTruckAvailable?: Record<string, boolean>;
  importTruckReservations?: Record<string, ImportTruckReservation>;
  /** Absent in freight rooms created before early truck calls were introduced. */
  earlyTruckAvailable?: Record<string, boolean>;
  /** Advanced operations for the upcoming rollover, grouped by terminal. */
  calledTrucks?: Record<number, TruckOperation[]>;
  voyageLog?: VoyageLogEntry[];
  /** New freight games grant each captain one short second sail for the whole match. */
  feederAvailable?: Record<string, boolean>;
  backhaulEnabled?: true;
  reeferSlots?: Record<number, number>; // Origin tile to most recent cold-chain pickup round.
  market?: FreightMarket; // Logistics saves created before tenders have no market.
  ports: Record<number, PortStock>;
  deliveries: Record<string, number>;
  emptyDeliveries: Record<string, number>;
  earnings: Record<string, number>;
  hasSailed: boolean;
}

export interface Player {
  id: string;
  name: string;
  token: VesselToken;
  freightRivalStyle?: FreightRivalStyle;
  balance: number;
  position: number;
  inHold: boolean;
  holdTurns: number;
  customsClearancePasses: number;
  isBankrupt: boolean;
  bankruptTo?: string | 'BANK';
  isOnline: boolean;
  secretMission?: SecretMissionCard;
  cargo?: CargoBooking;
  lastDelivery?: DeliveryReceipt;
  backhaul?: BackhaulJob;
  lastBackhaul?: BackhaulJob;
  lastBackhaulPaidRound?: number;
}

export type CardType = 'MARKET' | 'OPS';

export type CardEffectType =
  | 'CASH'
  | 'MOVE_TO'
  | 'STORM_CHOICE'
  | 'MOVE_STEPS'
  | 'GO_TO_HOLD'
  | 'GET_PASS'
  | 'PAY_PER_CONTAINER'
  | 'COLLECT_FROM_PLAYERS'
  | 'PAY_PLAYERS';

export interface CardEffect {
  type: CardEffectType;
  amount?: number;
  targetTile?: number;
  steps?: number;
  perContainerAmount?: number;
  perMegaTerminalAmount?: number;
}

export interface GameCard {
  id: string;
  type: CardType;
  title: string;
  description: string;
  effect: CardEffect;
}

export type TurnPhase =
  | 'AWAITING_SAIL'
  | 'WAIT_FOR_ROLL'
  | 'AWAITING_BUY_DECISION'
  | 'AWAITING_AUCTION'
  | 'AWAITING_STORM_DECISION'
  | 'AWAITING_SLOT_CHARTER_RESPONSE'
  | 'AWAITING_DEBT_RESOLUTION'
  | 'END_OF_TURN';

export type CharterRent =
  | { type: 'DISCOUNT' }
  | { type: 'SPLIT'; partnerId: string };

export interface DebtInfo {
  creditorId: string | 'BANK';
  amount: number;
  reason: string;
  tileId?: number;
  charterRent?: CharterRent;
}

export interface PendingSlotCharter {
  requesterId: string;
  ownerId: string;
  tileId: number;
  originalRent: number;
  discountedRent: number;
}

export interface PropertyAuction {
  id: number;
  revision: number;
  tileId: number;
  bidderId: string;
  leaderId: string | null;
  highestBid: number;
  passedIds: string[];
}

export interface TradeOffer {
  id: number;
  buyerId: string;
  sellerId: string;
  tileId: number;
  /** In a port exchange this deed travels from the buyer to the seller. */
  offeredTileId?: number;
  price: number;
  originalPrice?: number;
}

export interface GameState {
  mode?: GameMode; // Snapshots without a mode use the original board rules.
  /** Advertised by the connected server in live Monopoly room views. */
  supportsPortSwaps?: true;
  supportsHarborExportBooking?: true;
  supportsHarborPurchase?: true;
  harborFreight?: HarborFreightState;
  logistics?: LogisticsState;
  cargoRevision?: number;
  roomId: string;
  players: Player[];
  activePlayerIndex: number;
  properties: Record<number, PropertyState>;
  phase: TurnPhase;
  dice: [number, number];
  consecutiveDoubles: number;
  hasRolled: boolean;
  marketDeck: string[]; // Card IDs
  opsDeck: string[]; // Card IDs
  stormActive?: boolean; // OPS-02 visual for the current turn. Absent in older snapshots.
  auction?: PropertyAuction | null;
  auctionSequence?: number;
  tradeOffers?: TradeOffer[];
  tradeSequence?: number;
  canUpgradeCurrentPort?: boolean; // True when landing on an already-owned port (allows at most 1 upgrade on this visit)
  pendingDebt: DebtInfo | null;
  pendingSlotCharter: PendingSlotCharter | null;
  winnerId: string | null;
  turnCount: number;
  gameStarted: boolean;
}

export type StormChoice = 'TUG' | 'DRIFT';

export type CargoAction =
  | { type: 'LOAD_CARGO'; tileId: number; kind: CargoKind; reefer?: true; destinationTileId: number; revision: number }
  | { type: 'UNLOAD_CARGO'; tileId: number; originTileId: number; bookingId: number; revision: number; streetTurn?: true };
export type StreetTurnAction = Extract<CargoAction, { type: 'UNLOAD_CARGO' }> & { streetTurn: true };
export interface ReturnCargoToYardAction {
  type: 'RETURN_CARGO_TO_YARD'; tileId: number; bookingId: number; revision: number;
}
export type DestinationChange = { type: 'CHANGE_DESTINATION'; bookingId: number; destinationTileId: number; revision: number };
export type SailAction = { type: 'SAIL_TO_PORT'; tileId: number; revision: number };
export type FeederSailAction = { type: 'SAIL_FEEDER'; tileId: number; revision: number };

export type GameAction =
  | HarborLoadAction | HarborBookExportAction | HarborDischargeAction | HarborPurchaseAction | HarborRedeemAction | HarborRentReliefAction
  | ReserveImportTruckAction
  | ReturnCargoToYardAction
  | PortTruckCall
  | BackhaulAccept
  | CargoAction | DestinationChange | SailAction | FeederSailAction | FreightTenderBid | FreightTenderWithdrawal
  | { type: 'OFFER_TRADE'; tileId: number; sellerId: string; price: number }
  | { type: 'OFFER_PORT_SWAP'; tileId: number; sellerId: string; price: number; offeredTileId: number }
  | { type: 'COUNTER_TRADE'; offerId: number; price: number; offeredTileId?: number }
  | { type: 'RESPOND_TRADE'; offerId: number; accept: boolean; offeredTileId?: number }
  | { type: 'CANCEL_TRADE'; offerId: number }
  | { type: 'AUCTION_BID'; auctionId: number; revision: number; amount: number }
  | { type: 'AUCTION_PASS'; auctionId: number; revision: number }
  | { type: 'RESOLVE_STORM'; choice: StormChoice }
  | { type: 'ROLL_DICE'; forcedDice?: [number, number] }
  | { type: 'BUY_PROPERTY' }
  | { type: 'SKIP_BUY' }
  | { type: 'BUILD_CONTAINER'; tileId: number }
  | { type: 'SELL_CONTAINER'; tileId: number; expectedLevel?: number }
  | { type: 'UPGRADE_GREEN_FLEET'; tileId: number }
  | { type: 'PROPOSE_SLOT_CHARTER'; tileId: number }
  | { type: 'RESPOND_SLOT_CHARTER'; accept: boolean }
  | { type: 'CLAIM_MISSION_REWARD' }
  | { type: 'MORTGAGE_TILE'; tileId: number }
  | { type: 'UNMORTGAGE_TILE'; tileId: number }
  | { type: 'PAY_HOLD_FINE' }
  | { type: 'USE_CLEARANCE_PASS' }
  | { type: 'SETTLE_DEBT' }
  | { type: 'DECLARE_BANKRUPTCY' }
  | { type: 'END_TURN' };

export type GameEvent =
  | { type: 'HARBOR_LOADED'; playerId: string; tileId: number; exportBooking?: HarborExportTerms }
  | { type: 'HARBOR_DISCHARGED'; receipt: HarborFreightReceipt }
  | ({ type: 'IMPORT_TRUCK_RESERVED'; playerId: string } & ImportTruckReservation)
  | { type: 'PORT_TRUCK_CALLED'; operation: TruckOperation; tileId: number; playerId: string; scheduledRound: number }
  | { type: 'BACKHAUL_ACCEPTED' | 'BACKHAUL_EXPIRED' | 'BACKHAUL_FULFILLED'; playerId: string; job: BackhaulJob }
  | { type: 'FREIGHT_TENDER_BID'; tenderId: number; playerId: string }
  | { type: 'FREIGHT_TENDER_BID_WITHDRAWN'; tenderId: number; playerId: string }
  | ({ type: 'FREIGHT_TENDER_AWARDED' } & FreightAward)
  | ({ type: 'FREIGHT_CONTRACT_EXPIRED' } & FreightAward)
  | ({ type: 'FREIGHT_CONTRACT_FULFILLED'; bookingId: number } & FreightAward)
  | { type: 'LOGISTICS_TURN_ENDED'; playerId: string; sailed: boolean }
  | ({ type: 'CARGO_LOADED'; playerId: string; tileId: number } & CargoBooking)
  | { type: 'CARGO_RETURNED_TO_YARD'; playerId: string; tileId: number; bookingId: number;
      kind: CargoKind; destinationTileId: number; reeferDueRound?: number }
  | ({ type: 'CARGO_UNLOADED'; playerId: string } & DeliveryReceipt)
  | ({ type: 'CARGO_DESTINATION_CHANGED'; playerId: string; tileId: number; previousDestinationTileId: number } & CargoBooking)
  | { type: 'TRADE_OFFERED'; offer: TradeOffer }
  | { type: 'TRADE_COUNTERED'; offer: TradeOffer }
  | { type: 'TRADE_CLOSED'; offer: TradeOffer; result: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED' }
  | { type: 'AUCTION_STARTED'; tileId: number }
  | { type: 'AUCTION_ENDED'; tileId: number; winnerId: string | null; price: number }
  | { type: 'STORM_RESOLVED'; playerId: string; choice: StormChoice }
  | { type: 'DICE_ROLLED'; playerId: string; dice: [number, number]; isDouble: boolean }
  | { type: 'SHIP_STEPPED'; playerId: string; from: number; to: number; feeder?: true }
  | { type: 'PASSED_GO'; playerId: string; reward: number }
  | { type: 'SENT_TO_HOLD'; playerId: string; reason: string }
  | { type: 'RELEASED_FROM_HOLD'; playerId: string; method: 'DICE_DOUBLE' | 'FINE' | 'PASS' }
  | { type: 'TILE_PURCHASED'; playerId: string; tileId: number; price: number }
  | { type: 'CONTAINER_BUILT'; playerId: string; tileId: number; newLevel: number; cost: number }
  | { type: 'CONTAINER_SOLD'; playerId: string; tileId: number; newLevel: number; refund: number }
  | { type: 'GREEN_FLEET_UPGRADED'; playerId: string; tileId: number; cost: number }
  | { type: 'SLOT_CHARTER_PROPOSED'; requesterId: string; ownerId: string; tileId: number }
  | { type: 'SLOT_CHARTER_ACCEPTED'; requesterId: string; ownerId: string; tileId: number; rentPaid: number }
  | { type: 'SLOT_CHARTER_REJECTED'; requesterId: string; ownerId: string; tileId: number }
  | { type: 'SLOT_CHARTER_RENT_SPLIT'; visitorId: string; ownerId: string; partnerId: string; tileId: number; splitAmount: number; ownerAmount: number }
  | { type: 'MISSION_COMPLETED'; playerId: string; mission: SecretMissionCard; reward: number }
  | { type: 'TILE_MORTGAGED'; playerId: string; tileId: number; amount: number }
  | { type: 'TILE_UNMORTGAGED'; playerId: string; tileId: number; cost: number }
  | { type: 'DEMURRAGE_PAID'; debtorId: string; creditorId: string; tileId: number; amount: number }
  | { type: 'TAX_PAID'; playerId: string; tileId: number; amount: number }
  | { type: 'CARBON_TAX_EXEMPTED'; playerId: string; tileId: number; reason: string }
  | { type: 'CARD_DRAWN'; playerId: string; card: GameCard }
  | { type: 'DEBT_CREATED'; debtorId: string; creditorId: string | 'BANK'; amount: number; reason: string }
  | { type: 'DEBT_SETTLED'; debtorId: string; creditorId: string | 'BANK'; amount: number }
  | { type: 'BALANCE_CHANGED'; playerId: string; newBalance: number; delta: number; reason: string }
  | { type: 'PLAYER_BANKRUPT'; debtorId: string; creditorId: string | 'BANK' }
  | { type: 'GAME_OVER'; winnerId: string };

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
}
