import {
  Storage, Context, Address, validateAddress, transferCoins, generateEvent,
  callerHasWriteAccess, callee, caller, transferredCoins, isAddressEoa,
  unsafeRandom, timestamp, keccak256, currentPeriod, balanceOf, sendMessage
} from "@massalabs/massa-as-sdk";

import { Args, u64ToBytes, bytesToU64, stringToBytes } from "@massalabs/as-types";

/**           @Constants                      */
/**********************************************/
/** @_      - for default (can be changed)    */
/** @const_ - for default (can't be changed)  */
/**********************************************/

const MIN_VALUE = 'MIN_VALUE'    /** @_  10 MAS (10 * (10 ** 9))                        */
const MAX_FEE = 'MAX_FEE';       /** @const_   1.2 %                                    */
const COMMON_FEE = 'COMMON_FEE'; /** @_        1.2 %                                    */
const FISH_FEE = 'FISH_FEE';     /** @_        0.7 %                                    */
const WHALE_FEE = 'WHALE_FEE';   /** @_        0.4 %                                    */
const MIN_FEE = 'MIN_FEE';       /** @_  1 MAS (1 * (10 ** 9)), 1 USDT (1 * (10 ** 6))  */

const COMMON_AMOUNT = 'COMMON_AMOUN'; /** @const_  MIN_VALUE -  9_999.99 MAS  */
const FISH_AMOUNT = 'FISH_AMOUN';     /** @const_  10_000.00 - 29_999.99 MAS  */
const WHALE_AMOUNT = 'WHALE_AMOUN';   /** @const_  30_000.00  and  more  MAS  */

const DEAL_TIME_LIMIT = 'DEAL_TIME_LIMIT'; /** @_  1.5 hours  */

const ONGOING_DEALS = 'ONGOING_DEALS';

const LOTERY_BANK = 'LOTERY_BANK';
const LOTERY_BANK_DEVIDER = 20 as u64;      /** @const_    5%  */
const LOTERY_PARTICIPANTS = 'LOTERY_PARTICIPANTS';
const LAST_DEAL = 'LAST_DEAL';
const OTC_TRADED_AMOUNT = 'OTC_TRADED_AMOUNT';

/**
 * Address for lotery random winner desision.
 * Winner will be defined on future operation and balance of the address with active staking.
 * The top staking address for default. Will be changed if this one will stop the node.
 * */

const LOTERY_ADDRESS_DESIDER = 'LOTERY_ADDRESS_DESIDER';   /** @_  */

/**
 * This function is meant to be called only one time: when the contract is deployed.
 *
 * @param _ - not used
 */

export function constructor(_: StaticArray<u8>): void {
  // This line is important. It ensures that this function can't be called in the future.
  // If you remove this check, someone could call your constructor function and reset your smart contract.
  if (!Context.isDeployingContract()) {
    return;
  }
  Storage.set(MIN_VALUE, u64(10 * (10 ** 9)).toString());

  Storage.set(MAX_FEE, u8(12).toString());
  Storage.set(COMMON_FEE, u8(12).toString());
  Storage.set(FISH_FEE, u8(7).toString());
  Storage.set(WHALE_FEE, u8(4).toString());
  Storage.set(MIN_FEE, u8(1).toString());

  Storage.set(COMMON_AMOUNT, u64((10_000 * (10 ** 2)) - (1)).toString());
  Storage.set(FISH_AMOUNT, u64(10_000 * (10 ** 2)).toString());
  Storage.set(WHALE_AMOUNT, u64(30_000 * (10 ** 2)).toString());

  Storage.set(DEAL_TIME_LIMIT, u64(90 * 60 * 1000).toString());

  Storage.set(LOTERY_ADDRESS_DESIDER, 'AU12L4gaQ8j8j5yBt2jSmcsmu51yZW2gLjnZr5rAWnjKJDNacR3jp');
  Storage.set(LOTERY_BANK, u64(0).toString());
  Storage.set(OTC_TRADED_AMOUNT, u64(0).toString());

  let lotery_participants: string[] = [];
  Storage.set(stringToBytes(LOTERY_PARTICIPANTS), new Args().add(lotery_participants).serialize());

  let ongoing_deals: string[] = [];
  Storage.set(stringToBytes(ONGOING_DEALS), new Args().add(ongoing_deals).serialize());

  Storage.set(LAST_DEAL, u64(0).toString());

  Storage.set('Owner', `${caller()}`);

  generateEvent(
    `The BLACK_MASSA_OTC created: ${callee()}`
  );

  return;
}


/***   Start new deal and escrow Seller MAS.             ***/
export function startDeal(binaryArgs: StaticArray<u8>): void {

  assert(isAddressEoa(caller().toString()), `SC not allowed!`);

  const args = new Args(binaryArgs);

  const value = args.nextString().expect('value is missing or invalid');
  const fee = args.nextString().expect('fee is missing or invalid');
  const sellerPolygonAddress = args.nextString().expect('sellerPolygonAddress is missing or invalid');
  const buyerMassaAddress = args.nextString().expect('buyerMassaAddress is missing or invalid');
  const buyerPolygonAddress = args.nextString().expect('buyerPolygonAddress is missing or invalid');

  const rate = args.nextString().expect('rate is missing or invalid');
  const usdtValue = args.nextString().expect('usdtValue is missing or invalid');
  const usdtFee = args.nextString().expect('usdtFee is missing or invalid');

  assert(validateAddress(buyerMassaAddress) && isAddressEoa(buyerMassaAddress), `${buyerMassaAddress} is not a valid Buyer Massa address!`);
  assert(sellerPolygonAddress.length == 42 && sellerPolygonAddress.slice(0, 2) == '0x', `${sellerPolygonAddress} is wrong address!`);
  assert(buyerPolygonAddress.length == 42 && buyerPolygonAddress.slice(0, 2) == '0x', `${buyerPolygonAddress} is wrong address!`);
  assert(sellerPolygonAddress != buyerPolygonAddress, 'Seller and Buyer EVM addresses must be different!');
  assert(caller().toString() != buyerMassaAddress, 'Seller and Buyer Massa addresses must be different!');

  const min_value = u64.parse(Storage.get(MIN_VALUE));
  assert(u64.parse(value) >= min_value, `deal should be >= ${min_value} MAS!`);

  const min_fee = u64.parse(Storage.get(MIN_FEE));
  assert(u64.parse(fee) >= (min_fee * (10 ** 9)), `Massa fee should be >= ${min_fee} MAS!`);
  assert(u64.parse(usdtFee) >= (min_fee * (10 ** 6)), `USDT fee should be >= ${min_fee} USDT!`);

  const isValueEqTransferred = (u64.parse(value) + u64.parse(fee)) == transferredCoins();
  assert(isValueEqTransferred, `transferredCoins: ${transferredCoins()} should be equal value: ${value} + fee: ${fee}!`);

  // let calculated_fee = calculateFee(caller().toString(), value);
  let calculated_fee = calculateFee(new Args().add(caller().toString()).add(value).serialize());
  const isCalcFeeEqTransFee = (calculated_fee == u64.parse(fee));

  assert(isCalcFeeEqTransFee, `transferredFee ${(fee)} should be equal to ${calculated_fee} calculated_fee!`);

  // let calculated_usdt_fee = u64(Math.round(f64(calculateFee(buyerMassaAddress, (f64.parse(value)).toString())) * (f64.parse(rate)) / f64(10 ** 7))) * (10 ** 4);
  let calculated_usdt_fee = u64(Math.round(f64(calculateFee(new Args().add(buyerMassaAddress).add(value).serialize())) * (f64.parse(rate)) / f64(10 ** 7))) * (10 ** 4);

  if (calculated_usdt_fee < (min_fee * (10 ** 6))) {
    calculated_usdt_fee = (min_fee * (10 ** 6));
  }
  const isCalcUsdtFeeEqTransFee = (u64((calculated_usdt_fee)) == u64(f64.parse(usdtFee)));

  assert(isCalcUsdtFeeEqTransFee, `usdt data fee ${(u64.parse(usdtFee))} should be equal to ${calculated_usdt_fee} calculated_usdt_fee!`);

  const _CURRENT_DEAL_ID = (u64.parse(Storage.get(LAST_DEAL)) + 1).toString();
  const CURRENT_DEAL_ID = new Args().add(_CURRENT_DEAL_ID);

  if (Storage.has(CURRENT_DEAL_ID)) {
    throw new Error(`Deal #${_CURRENT_DEAL_ID} already exists`);
  }

  const TIME_LIMIT = u64(timestamp() + u64.parse(Storage.get(DEAL_TIME_LIMIT)));

  /**  @args  **************  1. Seller Massa Adress  2. Seller EVM Address      3. Buyer Massa Address 4. Buyer EVM Address     5. Amount  6. Fee   7. USDT amount 8. USDT fee  9. rate   10. timelimit  */
  const DEAL_DATA = new Args().add(caller().toString()).add(sellerPolygonAddress).add(buyerMassaAddress).add(buyerPolygonAddress).add(value).add(fee).add(usdtValue).add(usdtFee).add(rate).add(TIME_LIMIT);
  Storage.set(LAST_DEAL, _CURRENT_DEAL_ID);
  Storage.set(CURRENT_DEAL_ID, DEAL_DATA);

  /** Add new deal to ONGOING_DEALS array */
  let ongoing_deals = Storage.get(stringToBytes(ONGOING_DEALS));
  let new_ongoing_deals = new Args(ongoing_deals).nextStringArray().expect('ongoing_deals is missing or invalid');
  new_ongoing_deals.push(_CURRENT_DEAL_ID);
  Storage.set(stringToBytes(ONGOING_DEALS), new Args().add(new_ongoing_deals).serialize());

  const total = (u64.parse(value) + u64.parse(fee)).toString();
  const usdtTotal = (u64.parse(usdtValue) + u64.parse(usdtFee)).toString();

  generateEvent(`New deal started: 
  # ${_CURRENT_DEAL_ID},
  seller: ${caller()},
  seller EVM: ${sellerPolygonAddress},
  buyer: ${buyerMassaAddress},
  buyer EVM: ${buyerPolygonAddress},
  rate: ${rate} USDT per MAS,
  value: ${value.slice(0, value.length - 9)}.${value.slice(value.length - 9, value.length - 7)} MAS, fee: ${fee.slice(0, fee.length - 9)}.${fee.slice(fee.length - 9, fee.length - 7)} MAS, total: ${total.slice(0, total.length - 9)}.${total.slice(total.length - 9, total.length - 7)} MAS,
  USDT value: ${usdtValue.slice(0, usdtValue.length - 6)}.${usdtValue.slice(usdtValue.length - 6, usdtValue.length - 4)} USDT, fee: ${usdtFee.slice(0, usdtFee.length - 6)}.${usdtFee.slice(usdtFee.length - 6, usdtFee.length - 4)} USDT, total: ${usdtTotal.slice(0, usdtTotal.length - 6)}.${usdtTotal.slice(usdtTotal.length - 6, usdtTotal.length - 4)} USDT,
  timelimit: ${TIME_LIMIT}`
  );
}


/***                   Fee calculation                          ***/
/******************************************************************/
/*      Dinamic fee calculation related to deal amount
 *      and previous traded amount. 4 stages:
 *        1. small amount, fee = MIN_FEE
 *        2. amount less than COMMON_AMOUNT, fee = COMMON_FEE
 *        3. amount greater than COMMON_AMOUNT 
 *           and up to WHALE_AMOUNT fee = PREMIUM_FEE
 *        4. amount greater than PREMIUM_AMOUNT, fee = WHALE_FEE
 *      If previous traded amount partially cover the stage and new deal + previous amount sum
 *      greater than previous stage limit, amount up to this limit will be with fee of this stage
 *      and remainder amount will be with smaller fee of next stage.
 ******************************************************************/
// export function calculateFee(address: string, value: string): u64 {
export function calculateFee(_args: StaticArray<u8>): u64 {
  const args = new Args(_args);
  const address = args.nextString().expect('address is missing or invalid');
  const value = args.nextString().expect('value is missing or invalid');
  const traded_amount = f64(u64.parse(Storage.has(address) ? Storage.get(address) : u64(0).toString()) / (10 ** 7));
  const amount = f64(u64.parse(value) / (10 ** 7));

  const common_fees = f64.parse(Storage.get(COMMON_FEE)) / (10 ** 3);
  const premium_fees = f64.parse(Storage.get(FISH_FEE)) / (10 ** 3);
  const whale_fees = f64.parse(Storage.get(WHALE_FEE)) / (10 ** 3);

  const common_amount = f64.parse(Storage.get(COMMON_AMOUNT));
  const premium_amount = f64.parse(Storage.get(FISH_AMOUNT));
  const whale_amount = f64.parse(Storage.get(WHALE_AMOUNT));

  let fees = 0 as f64;

  /********   Whale    *********/
  if (traded_amount >= whale_amount || amount >= whale_amount) {
    fees = amount * whale_fees;
    
  }

  /********   Common   *********/
  else if (traded_amount <= common_amount) {

    if (amount <= common_amount) {

      /********  Common after Common   *********/
      let cmnf_remaining_amount = (premium_amount - traded_amount);
      let cmnf_amount = amount - cmnf_remaining_amount;

      if (cmnf_amount <= 0) {
        fees = (amount * common_fees);
        
      }
      
      else if (cmnf_amount > 0) {

        fees = (cmnf_remaining_amount * common_fees);
        let prmf_amount = (amount - cmnf_remaining_amount);

        if (prmf_amount > 0) {

          /********  Premium after Common   *********/
          let prmf_fees = prmf_amount * premium_fees;
          fees += prmf_fees;
          
        }
      }
    }

    if (amount > common_amount) {

      /********  Premium   *********/
      let prmf_remaining_amount = ((whale_amount - (1)) - traded_amount);
      let prmf_amount = amount - prmf_remaining_amount;

      if (prmf_amount <= 0) {
        fees = (amount * premium_fees);
        
      }

      else if (prmf_amount > 0) {

        fees = (prmf_remaining_amount * premium_fees);
        let wlf_amount = (amount - prmf_remaining_amount);
        

        if (wlf_amount > 0) {

          /********  Whale after Premium   *********/
          let wl_fees = wlf_amount * whale_fees;
          fees += wl_fees;
          
        }
      }
    }
  }

  /********  Premium   *********/
  else if (traded_amount > common_amount) {

    /********  Premium after Premium   *********/
    let prmf_remaining_amount = ((whale_amount - (1)) - traded_amount);
    let prmf_amount = amount - prmf_remaining_amount;

    if (prmf_amount <= 0) {
      fees = (amount * premium_fees);
    }

    else if (prmf_amount > 0) {

      fees = (prmf_remaining_amount * premium_fees);
      let wlf_amount = (amount - prmf_remaining_amount);

      if (wlf_amount > 0) {

        /********  Whale after Premium   *********/
        let wl_fees = wlf_amount * whale_fees;
        fees += wl_fees;
      }
    }
  }

  const fee = u64(Math.round(f64(fees))) * (10 ** 7) as u64;
  const min_fee = u64.parse(Storage.get(MIN_FEE)) * (10 ** 9);

  if (min_fee > fee) {
    return min_fee;

  } else {
    return fee;
  }
}


/***     returns previous traded amount for specified address      ***/
export function getTradedAmount(_address: StaticArray<u8>): StaticArray<u8> {

  const address = new Args(_address).nextString().expect('_address is missing or invalid');
  const tradedAmount = Storage.has(address) ? Storage.get(address) : u64(0).toString();

  return new Args().add(tradedAmount).serialize();
}


/***     returns the ongoing deals list         ***/
export function getOngoinDeals(): StaticArray<u8> {
  return Storage.get(stringToBytes(ONGOING_DEALS));
}


/***     returns the specified deal data        ***/
export function getDealData(_deal: StaticArray<u8>): StaticArray<u8> {
  const deal = new Args(_deal);
  const DEAL_DATA = Storage.get(deal);

  return DEAL_DATA.serialize();
}


/***  Unhold MAS to the Buyer if the buyer pay USDT within the time  ***/
export function endDeal(_deal: StaticArray<u8>): void {
  assert(callerHasWriteAccess, 'not an owner');

  const deal = new Args(_deal);
  const _CURRENT_DEAL_ID = deal.nextString().expect('CURRENT_DEAL_ID is missing or invalid');
  const DEAL_DATA = Storage.get(deal);

  const sellerMassaAddress = DEAL_DATA.nextString().expect('sellerMassaAddress is missing or invalid');
  const sellerPolygonAddress = DEAL_DATA.nextString().expect('sellerPolygonAddress is missing or invalid');
  const buyerMassaAddress = DEAL_DATA.nextString().expect('buyerMassaAddress is missing or invalid');
  const buyerPolygonAddress = DEAL_DATA.nextString().expect('buyerPolygonAddress is missing or invalid');
  const value = DEAL_DATA.nextString().expect('value is missing or invalid');
  const fee = DEAL_DATA.nextString().expect('fee is missing or invalid');
  const usdtValue = DEAL_DATA.nextString().expect('usdtValue is missing or invalid');
  const usdtFee = DEAL_DATA.nextString().expect('usdtFee is missing or invalid');
  const rate = DEAL_DATA.nextString().expect('rate is missing or invalid');

  const TO_LOTERY_BANK = u64(u64.parse(fee) / LOTERY_BANK_DEVIDER);

  transferCoins(new Address(buyerMassaAddress), u64.parse(value));
  transferCoins(new Address(Storage.get('Owner')), u64.parse(fee) - TO_LOTERY_BANK);

  Storage.set(LOTERY_BANK, (u64.parse(Storage.get(LOTERY_BANK)) + TO_LOTERY_BANK).toString());
  Storage.set(OTC_TRADED_AMOUNT, (u64.parse(Storage.get(OTC_TRADED_AMOUNT)) + u64.parse(value)).toString());

  if (Storage.has(sellerMassaAddress)) {

    const prevTradedAmount = u64.parse(Storage.get(sellerMassaAddress));
    Storage.set(sellerMassaAddress, (u64.parse(value) + prevTradedAmount).toString());

  } else {
    Storage.set(sellerMassaAddress, value);
  }

  if (Storage.has(buyerMassaAddress)) {

    const prevTradedAmount = u64.parse(Storage.get(buyerMassaAddress));
    Storage.set(buyerMassaAddress, (u64.parse(value) + prevTradedAmount).toString());

  } else {
    Storage.set(buyerMassaAddress, value);
  }

  let lotery_participants = Storage.get(stringToBytes(LOTERY_PARTICIPANTS));
  let new_lotery_participants = new Args(lotery_participants).nextStringArray().expect('lotery_participants is missing or invalid');
  new_lotery_participants.push(sellerMassaAddress);
  new_lotery_participants.push(buyerMassaAddress);
  Storage.set(stringToBytes(LOTERY_PARTICIPANTS), new Args().add(new_lotery_participants).serialize());

  Storage.del(deal);

  /* Remove the current deal from ONGOING_DEALS array */
  let ongoing_deals = Storage.get(stringToBytes(ONGOING_DEALS));

  let new_ongoing_deals = new Args(ongoing_deals).nextStringArray().expect('ongoing_deals is missing or invalid');
  new_ongoing_deals.splice(new_ongoing_deals.indexOf(_CURRENT_DEAL_ID), 1);
  Storage.set(stringToBytes(ONGOING_DEALS), new Args().add(new_ongoing_deals).serialize());

  const total = (u64.parse(value) + u64.parse(fee)).toString();
  const usdtTotal = (u64.parse(usdtValue) + u64.parse(usdtFee)).toString();

  generateEvent(`Deal # ${_CURRENT_DEAL_ID} successfully ended!,
  seller: ${sellerMassaAddress},
  seller EVM: ${sellerPolygonAddress},
  buyer: ${buyerMassaAddress},
  buyer EVM: ${buyerPolygonAddress},
  rate: ${rate} USDT per MAS,
  value: ${value.slice(0, value.length - 9)}.${value.slice(value.length - 9, value.length - 7)} MAS, fee: ${fee.slice(0, fee.length - 9)}.${fee.slice(fee.length - 9, fee.length - 7)} MAS, total: ${total.slice(0, total.length - 9)}.${total.slice(total.length - 9, total.length - 7)} MAS,
  USDT value: ${usdtValue.slice(0, usdtValue.length - 6)}.${usdtValue.slice(usdtValue.length - 6, usdtValue.length - 4)} USDT, USDTfee: ${usdtFee.slice(0, usdtFee.length - 6)}.${usdtFee.slice(usdtFee.length - 6, usdtFee.length - 4)} USDT, total: ${usdtTotal.slice(0, usdtTotal.length - 6)}.${usdtTotal.slice(usdtTotal.length - 6, usdtTotal.length - 4)} USDT
  `);
}


/***  Refund MAS to the Seller if the buyer didn't pay for it within the time specified  ***/
export function refund(_deal: StaticArray<u8>): void {
  assert(callerHasWriteAccess, 'not an owner');

  const deal = new Args(_deal);
  const _CURRENT_DEAL_ID = deal.nextString().expect('_CURRENT_DEAL_ID is missing or invalid');
  const DEAL_DATA = Storage.get(deal);

  const sellerMassaAddress = DEAL_DATA.nextString().expect('sellerMassaAddress is missing or invalid');
  const sellerPolygonAddress = DEAL_DATA.nextString().expect('sellerPolygonAddress is missing or invalid');
  const buyerMassaAddress = DEAL_DATA.nextString().expect('buyerMassaAddress is missing or invalid');
  const buyerPolygonAddress = DEAL_DATA.nextString().expect('buyerPolygonAddress is missing or invalid');
  const value = DEAL_DATA.nextString().expect('value is missing or invalid');
  const fee = DEAL_DATA.nextString().expect('fee is missing or invalid');
  const usdtValue = DEAL_DATA.nextString().expect('usdtValue is missing or invalid');
  const usdtFee = DEAL_DATA.nextString().expect('usdtFee is missing or invalid');
  const rate = DEAL_DATA.nextString().expect('rate is missing or invalid');
  const timeLimit = DEAL_DATA.nextU64().expect('usdtFee is missing or invalid');

  assert(timeLimit < timestamp(), 'time is not over yet');

  const min_fee = u64.parse(Storage.get(MIN_FEE)) * (10 ** 9);

  const toRefund = (u64.parse(value) + u64.parse(fee) - min_fee);

  transferCoins(new Address(sellerMassaAddress), toRefund);
  transferCoins(new Address(Storage.get('Owner')), min_fee);
  Storage.del(deal);

  /* Remove the current deal from ONGOING_DEALS array */
  let ongoing_deals = Storage.get(stringToBytes(ONGOING_DEALS));

  let new_ongoing_deals = new Args(ongoing_deals).nextStringArray().expect('ongoing_deals is missing or invalid');
  new_ongoing_deals.splice(new_ongoing_deals.indexOf(_CURRENT_DEAL_ID), 1);
  Storage.set(stringToBytes(ONGOING_DEALS), new Args().add(new_ongoing_deals).serialize());

  generateEvent(
  `Deal #${_CURRENT_DEAL_ID} REFUND,
  ${toRefund.toString().slice(0, toRefund.toString().length - 9)}.${toRefund.toString().slice(toRefund.toString().length - 9, toRefund.toString().length - 7)} MAS refunded back to ${sellerMassaAddress}`);
}


/***     returns the owner        ***/
export function getOwner(): StaticArray<u8> {
  generateEvent(`BLACK_MASSA_OTC OWNER: ${Storage.get('Owner')}`);
  return new Args().add(Storage.get('Owner')).serialize();
}


/***     returns the lotery bank     ***/
export function getLoteryBank(): StaticArray<u8> {
  generateEvent(`BLACK_MASSA_OTC LOTERY BANK: ${Storage.get(LOTERY_BANK)}`);
  return new Args().add(Storage.get(LOTERY_BANK)).serialize();
}


/***     returns the lotery bank     ***/
export function getOtcTradedAmount(): StaticArray<u8> {
  generateEvent(`BLACK_MASSA_OTC TRADED AMOUNT: ${Storage.get(OTC_TRADED_AMOUNT)}`);
  return new Args().add(Storage.get(OTC_TRADED_AMOUNT)).serialize();
}


/***     returns the lotery participants list        ***/
export function getLoteryParticipants(): StaticArray<u8> {
  // return new Args().add(Storage.get(stringToBytes(LOTERY_PARTICIPANTS))).serialize();
  return new Args(Storage.get(stringToBytes(LOTERY_PARTICIPANTS))).serialize();

}


/***     Start the future lotery         ***/
export function sendFutureLoteryStart(): void {
  assert(callerHasWriteAccess, 'not an owner!');

  const validityStartThread = 0 as u8;
  const validityEndThread = 31 as u8;

  const unRand = u64(unsafeRandom());
  const curPer = currentPeriod();
  const start = (curPer + unRand % validityEndThread) + 1;
  const address = Context.callee();
  const functionName = 'startLotery';
  const validityStartPeriod = start;
  const validityEndPeriod = validityStartPeriod;

  const maxGas = 500_000_000; // gas for smart contract execution
  const rawFee = 0;
  const coins = 0;

  sendMessage(
    address,
    functionName,
    validityStartPeriod,
    validityStartThread,
    validityEndPeriod,
    validityEndThread,
    maxGas,
    rawFee,
    coins,
    [],
  );

  generateEvent(
    `BLACK_MASSA_OTC lotery planned on ${validityStartPeriod} period
    current period: ${curPer}`,
  );
}


/***     set new lotery address decider       ***/
export function setLoteryAddressDecider(newAddress: StaticArray<u8>): StaticArray<u8> {
  assert(callerHasWriteAccess, 'not an owner!');

  const loteryAddressDecider = new Args(newAddress).nextString().expect('newAddressDesider is missing or invalid');
  Storage.set(LOTERY_ADDRESS_DESIDER, loteryAddressDecider);

  generateEvent(`New lotery address decider: ${loteryAddressDecider}`);

  return new Args().add(loteryAddressDecider).serialize();
}


/***    Start the lotery    ***/
export function startLotery(): void {
  assert(callerHasWriteAccess, 'not an owner!');

  const loteryAddressDecider = Storage.get(LOTERY_ADDRESS_DESIDER);

  let lotery_participants = new Args(Storage.get(stringToBytes(LOTERY_PARTICIPANTS))).nextStringArray().expect('Argument(lotery_participants) is missing or invalid');
  assert(lotery_participants.length > 0, 'no lotery participants');

  let participants_count = i32(lotery_participants.length - 1);

  let WINNER_ID = i32(u64(bytesToU64(keccak256(u64ToBytes(balanceOf(loteryAddressDecider))))) % participants_count);

  let WINNER = lotery_participants[WINNER_ID];

  while (WINNER == Storage.get('Owner')) {
    let NEW_WINNER_ID = WINNER_ID;

    if (NEW_WINNER_ID == participants_count) {
      NEW_WINNER_ID = 0;
    } else {
      NEW_WINNER_ID = WINNER_ID + 1
    }

    WINNER_ID = NEW_WINNER_ID;
    WINNER = lotery_participants[WINNER_ID]
  }

  const PRIZE = Storage.get(LOTERY_BANK);

  transferCoins(new Address(WINNER), u64.parse(PRIZE));

  Storage.set(LOTERY_BANK, u64(0).toString());

  generateEvent(
  `WINNER of the BLACK_MASSA_OTC lotery: ${WINNER} with ID ${WINNER_ID.toString()}. CONGRATULATIONS! ${PRIZE.slice(0, PRIZE.length - 9)}.${PRIZE.slice(PRIZE.length - 9, PRIZE.length - 7)} MAS transferred to the WINNER!`
  );
}


/***    Withdraw amount if no ongoing_deals    ***/
export function withdraw(amount: u64): void {
  assert(callerHasWriteAccess, 'not an owner!');

  let ongoing_deals = new Args(Storage.get(stringToBytes(ONGOING_DEALS))).nextStringArray().expect('ongoing_deals is missing or invalid');
  assert(ongoing_deals.length == 0, 'ongoing_deals');
  assert(u64.parse(Storage.get(LOTERY_BANK)) == 0, 'lotery first!');

  transferCoins(caller(), amount);

  generateEvent(`${amount} transferred to Owner`);
}


/***    SET minimum amount, fees, deal_time_limit     ***/
/** @param min_value       u8 10: 10 MAS,               */
/** @param fee             u8 10: 1%                    */
/** @param deal_time_limit u64 seconds to timestamp     */

export function setFee(binaryArgs: StaticArray<u8>): void {
  assert(callerHasWriteAccess, `${caller} not an owner!`);

  const args = new Args(binaryArgs);
  const max_fee = u8.parse(Storage.get(MAX_FEE));
  const min_value = args.nextString().expect('min_value is missing or invalid');
  const common_fee = args.nextString().expect('common_fee is missing or invalid');
  const fish_fee = args.nextString().expect('fish_fee is missing or invalid');
  const whale_fee = args.nextString().expect('whale_fee is missing or invalid');
  const min_fee = args.nextString().expect('min_fee is missing or invalid');
  const deal_time_limit = args.nextString().expect('deal_time_limit is missing or invalid');

  assert(u8.parse(common_fee) <= max_fee && u8.parse(fish_fee) <= max_fee && u8.parse(whale_fee) <= max_fee, `fee should be less than ${max_fee}!`);

  Storage.set(MIN_VALUE, (u64.parse(min_value) * (10 ** 9)).toString());
  Storage.set(COMMON_FEE, common_fee);
  Storage.set(FISH_FEE, fish_fee);
  Storage.set(WHALE_FEE, whale_fee);
  Storage.set(MIN_FEE, min_fee);
  Storage.set(DEAL_TIME_LIMIT, deal_time_limit);

  generateEvent( `BLACK_MASSA_OTC new values:
  MIN_VALUE: ${min_value} MAS,
  COMMON_FEE: ${common_fee.length > 1 ? common_fee.slice(0, 1) + '.' + common_fee.slice(1) : '0.' + common_fee}%,
  FISH_FEE: ${fish_fee.length > 1 ? fish_fee.slice(0, 1) + '.' + fish_fee.slice(1) : '0.' + fish_fee}%,
  WHALE_FEE: ${whale_fee.length > 1 ? whale_fee.slice(0, 1) + '.' + whale_fee.slice(1) : '0.' + whale_fee}%,
  MIN_FEE: ${min_fee},
  DEAL_TIME_LIMIT: ${deal_time_limit}`
  );
}
