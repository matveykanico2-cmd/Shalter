import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { StoriesModule } from "../stories/stories.module.js";
import { BackgroundJobsRepository } from "./background-jobs.repository.js";
import { BackgroundService } from "./background.service.js";
import { JobRunnerService } from "./job-runner.service.js";
import { MediaJobsService } from "./media-jobs.service.js";
import { SweepsService } from "./sweeps.service.js";

// Фоновая работа: очередь задач (background_jobs) и обходы по таймеру. Модуль подключают и
// фоновый процесс (worker.module.ts), и основной — для BACKGROUND_WORKER=0. MessagesModule
// не импортируется: его отправка отложенных стартует сама и в фоновом процессе ушла бы
// второй раз, а здесь нужен только репозиторий.
@Module({
  imports: [ChatsModule, StoriesModule],
  providers: [BackgroundService, JobRunnerService, MediaJobsService, SweepsService, BackgroundJobsRepository, MessagesRepository],
  exports: [BackgroundService, SweepsService],
})
export class BackgroundModule {}
