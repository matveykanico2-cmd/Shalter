import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { StoriesModule } from "../stories/stories.module.js";
import { UsersModule } from "../users/users.module.js";
import { BackgroundJobsRepository } from "./background-jobs.repository.js";
import { BackgroundService } from "./background.service.js";
import { JobRunnerService } from "./job-runner.service.js";
import { MediaJobsService } from "./media-jobs.service.js";
import { GreetingsRepository } from "./greetings.repository.js";
import { RemindersRepository } from "./reminders.repository.js";
import { SweepsService } from "./sweeps.service.js";
import { AccountDeletionSweep } from "./sweeps/account-deletion.sweep.js";
import { AutoDeleteSweep } from "./sweeps/auto-delete.sweep.js";
import { BirthdaysSweep } from "./sweeps/birthdays.sweep.js";
import { HolidaysSweep } from "./sweeps/holidays.sweep.js";
import { RemindersSweep } from "./sweeps/reminders.sweep.js";
import { UploadsSweep } from "./sweeps/uploads.sweep.js";
import { UploadRefsRepository } from "./upload-refs.repository.js";

// Фоновая работа: очередь задач (background_jobs) и обходы по таймеру. Модуль подключают и
// фоновый процесс (worker.module.ts), и основной — для BACKGROUND_WORKER=0. MessagesModule
// не импортируется: его отправка отложенных стартует сама и в фоновом процессе ушла бы
// второй раз, а здесь нужен только репозиторий.
@Module({
  imports: [ChatsModule, StoriesModule, UsersModule],
  providers: [
    BackgroundService,
    JobRunnerService,
    MediaJobsService,
    SweepsService,
    AutoDeleteSweep,
    RemindersSweep,
    AccountDeletionSweep,
    BirthdaysSweep,
    HolidaysSweep,
    UploadsSweep,
    BackgroundJobsRepository,
    RemindersRepository,
    GreetingsRepository,
    UploadRefsRepository,
    MessagesRepository,
  ],
  exports: [BackgroundService, SweepsService],
})
export class BackgroundModule {}
