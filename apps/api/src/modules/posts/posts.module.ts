import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { PostViewsRepository } from "./post-views.repository.js";
import { PostsController } from "./posts.controller.js";
import { PostsService } from "./posts.service.js";

// Посты каналов (/api/posts): публикация, просмотры, комментарии. Отправка комментария — та же,
// что у обычного сообщения (MessageSendService).
@Module({
  imports: [ChatsModule, MessagesModule, UsersModule],
  controllers: [PostsController],
  providers: [PostsService, PostViewsRepository],
})
export class PostsModule {}
