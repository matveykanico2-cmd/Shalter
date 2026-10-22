import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { sendMessageSchema, type SendMessageDto } from "../messages/model/schemas/message.schema.js";
import { publishPostSchema, type PublishPostDto } from "./model/schemas/post.schema.js";
import { PostsService } from "./posts.service.js";

@Controller("api/posts")
@UseGuards(AuthGuard)
export class PostsController {
  public constructor(private readonly posts: PostsService) {}

  @Post(":channelId/publish")
  @HttpCode(200)
  public publish(@Req() req: Request, @Param("channelId") channelId: string, @Body(new ZodValidationPipe(publishPostSchema)) dto: PublishPostDto) {
    return this.posts.publish(req.uid!, channelId, dto);
  }

  @Post(":postId/view")
  @HttpCode(200)
  public view(@Req() req: Request, @Param("postId") postId: string) {
    return this.posts.view(req.uid!, postId);
  }

  @Get(":postId/comments")
  public comments(@Req() req: Request, @Param("postId") postId: string) {
    return this.posts.comments(req.uid!, postId);
  }

  @Post(":postId/comments")
  @HttpCode(200)
  public comment(@Req() req: Request, @Param("postId") postId: string, @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto) {
    return this.posts.comment(req.uid!, postId, dto);
  }
}
