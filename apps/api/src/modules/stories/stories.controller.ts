import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  createChannelStorySchema,
  createStorySchema,
  editStoryCommentSchema,
  storyCommentSchema,
  type CreateChannelStoryDto,
  type CreateStoryDto,
  type EditStoryCommentDto,
  type StoryCommentDto,
} from "./model/schemas/story.schema.js";
import { StoriesService } from "./stories.service.js";

// user/… и channel/… раньше :id/…, как в server/routes/stories.js.
@Controller("api/stories")
@UseGuards(AuthGuard)
export class StoriesController {
  public constructor(private readonly stories: StoriesService) {}

  @Get()
  public feed(@Req() req: Request) {
    return this.stories.feed(req.uid!);
  }

  @Get("user/:userId")
  public ofUser(@Req() req: Request, @Param("userId") userId: string) {
    return this.stories.ofUser(req.uid!, userId);
  }

  @Get("user/:userId/archive")
  public archive(@Req() req: Request, @Param("userId") userId: string) {
    return this.stories.archive(req.uid!, userId);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createStorySchema)) dto: CreateStoryDto) {
    return this.stories.create(req.uid!, dto);
  }

  @Post("channel/:chatId")
  @HttpCode(200)
  public createForChannel(@Req() req: Request, @Param("chatId") chatId: string, @Body(new ZodValidationPipe(createChannelStorySchema)) dto: CreateChannelStoryDto) {
    return this.stories.createForChannel(req.uid!, chatId, dto);
  }

  @Post(":id/view")
  @HttpCode(200)
  public view(@Req() req: Request, @Param("id") id: string) {
    return this.stories.view(req.uid!, id);
  }

  @Post(":id/like")
  @HttpCode(200)
  public like(@Req() req: Request, @Param("id") id: string) {
    return this.stories.like(req.uid!, id);
  }

  @Get(":id/comments")
  public comments(@Req() req: Request, @Param("id") id: string) {
    return this.stories.comments(req.uid!, id);
  }

  @Post(":id/comments")
  @HttpCode(200)
  public addComment(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(storyCommentSchema)) dto: StoryCommentDto) {
    return this.stories.addComment(req.uid!, id, dto);
  }

  @Post(":id/comments/:commentId/like")
  @HttpCode(200)
  public likeComment(@Req() req: Request, @Param("id") id: string, @Param("commentId") commentId: string) {
    return this.stories.likeComment(req.uid!, id, commentId);
  }

  @Patch(":id/comments/:commentId")
  public editComment(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body(new ZodValidationPipe(editStoryCommentSchema)) dto: EditStoryCommentDto
  ) {
    return this.stories.editComment(req.uid!, id, commentId, dto);
  }

  @Delete(":id/comments/:commentId")
  public deleteComment(@Req() req: Request, @Param("id") id: string, @Param("commentId") commentId: string) {
    return this.stories.deleteComment(req.uid!, id, commentId);
  }

  @Get(":id/viewers")
  public viewers(@Req() req: Request, @Param("id") id: string) {
    return this.stories.viewers(req.uid!, id);
  }

  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.stories.remove(req.uid!, id);
  }
}
