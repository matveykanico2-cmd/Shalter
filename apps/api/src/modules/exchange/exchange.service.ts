import { Injectable } from "@nestjs/common";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { ApiError } from "../../common/errors/api-error.js";
import { UsersRepository } from "../users/users.repository.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessageSendService } from "../messages/message-send.service.js";
import { ExchangeRepository } from "./exchange.repository.js";
import type { ConvertDto, CreateCoinDto, CreatorDto, MintDto, RateDto, TransferDto } from "./model/schemas/exchange.schema.js";

@Injectable()
export class ExchangeService {
  public constructor(
    private readonly repo: ExchangeRepository,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessageSendService,
  ) {}

  private permissions(uid: string) {
    const user = this.users.findById(uid);
    const isAdmin = hasAdminSection(user, "exchange");
    return { isAdmin, canCreate: isAdmin || this.repo.isCreator(uid) };
  }

  private present(coin: NonNullable<ReturnType<ExchangeRepository["coin"]>>) {
    const history = this.repo.history(coin.id);
    const first = history[0]?.rate ?? coin.currentRate;
    const changePercent = first ? ((coin.currentRate - first) / first) * 100 : 0;
    return { ...coin, changePercent: Math.round(changePercent * 100) / 100, history };
  }

  public list(uid: string) {
    return { coins: this.repo.listCoins().map((coin) => this.present(coin)), permissions: this.permissions(uid) };
  }

  public create(uid: string, dto: CreateCoinDto) {
    if (!this.permissions(uid).canCreate) throw new ApiError(403, "Нет права создавать монеты");
    try {
      return { coin: this.present(this.repo.create({ ...dto, userId: uid })) };
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new ApiError(409, "Монета с таким тикером уже существует");
      throw err;
    }
  }

  public setRate(uid: string, id: string, dto: RateDto) {
    const coin = this.repo.coin(id);
    if (!coin) throw new ApiError(404, "Монета не найдена");
    const p = this.permissions(uid);
    if (!p.isAdmin && (!p.canCreate || coin.createdBy !== uid)) throw new ApiError(403, "Менять курс может администратор или создатель монеты");
    return { coin: this.present(this.repo.setRate(id, dto.rate, uid)!) };
  }

  public creators(uid: string) {
    if (!this.permissions(uid).isAdmin) throw new ApiError(403, "Недостаточно прав");
    return { creators: this.repo.creators() };
  }

  public setCreator(uid: string, dto: CreatorDto) {
    if (!this.permissions(uid).isAdmin) throw new ApiError(403, "Недостаточно прав");
    if (!this.users.findById(dto.userId)) throw new ApiError(404, "Пользователь не найден");
    this.repo.setCreator(dto.userId, dto.enabled, uid);
    return { creators: this.repo.creators() };
  }

  public wallet(uid: string) {
    return {
      balances: this.repo.wallet(uid).map(({ coin, amount }) => {
        const changePercent = this.present(coin).changePercent;
        return { coin: { ...coin, changePercent }, amount };
      }),
    };
  }

  public mint(uid: string, coinId: string, dto: MintDto) {
    const coin = this.repo.coin(coinId);
    if (!coin) throw new ApiError(404, "Монета не найдена");
    const p = this.permissions(uid);
    if (!p.isAdmin && (!p.canCreate || coin.createdBy !== uid)) throw new ApiError(403, "Выпускать монету может администратор или её создатель");
    if (!this.users.findById(dto.userId)) throw new ApiError(404, "Пользователь не найден");
    const transaction = this.repo.mint(coin.id, dto.userId, dto.amount);
    return { transaction, wallet: this.wallet(dto.userId) };
  }

  public async transfer(uid: string, dto: TransferDto) {
    if (dto.userId === uid) throw new ApiError(400, "Нельзя перевести монеты самому себе");
    const chat = this.chats.findById(dto.chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "Чат не найден");
    if (!chat.memberIds.includes(dto.userId)) throw new ApiError(400, "Получатель не состоит в этом чате");
    const recipient = this.users.findById(dto.userId);
    const coin = this.repo.coin(dto.coinId);
    if (!recipient) throw new ApiError(404, "Пользователь не найден");
    if (!coin) throw new ApiError(404, "Монета не найдена");
    const transaction = this.repo.transfer(uid, recipient.id, coin.id, dto.amount, chat.id);
    if (!transaction) throw new ApiError(400, "Недостаточно монет");
    await this.messages.sendTrustedAttachment(uid, chat, `Перевод ${transaction.amount} ${coin.symbol}`, {
      kind: "coin-transfer",
      meta: { transactionId: transaction.id, coinId: coin.id, symbol: coin.symbol, name: coin.name, color: coin.color, amount: transaction.amount, fromUserId: uid, toUserId: recipient.id, toName: recipient.name },
    });
    return { transaction, wallet: this.wallet(uid) };
  }

  public convert(uid: string, dto: ConvertDto) {
    if (dto.fromCoinId === dto.toCoinId) throw new ApiError(400, "Выберите разные монеты");
    const from = this.repo.coin(dto.fromCoinId);
    const to = this.repo.coin(dto.toCoinId);
    if (!from || !to) throw new ApiError(404, "Монета не найдена");
    const targetAmount = Math.round(((dto.amount * from.currentRate) / to.currentRate + Number.EPSILON) * 1_000_000) / 1_000_000;
    if (!targetAmount) throw new ApiError(400, "Слишком маленькое количество");
    const transaction = this.repo.convert(uid, from.id, to.id, dto.amount, targetAmount);
    if (!transaction) throw new ApiError(400, "Недостаточно монет");
    return { transaction, wallet: this.wallet(uid) };
  }
}
