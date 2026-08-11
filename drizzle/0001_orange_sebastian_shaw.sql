CREATE TABLE `agent_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`agent` varchar(64) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`memoryTier` enum('short-term','working','long-term','episodic','user preferences') NOT NULL,
	`key` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileType` varchar(64) NOT NULL,
	`storageUrl` text NOT NULL,
	`fileKey` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`stepIndex` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`agent` varchar(64) NOT NULL,
	`status` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`output` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`goal` longtext NOT NULL,
	`status` enum('pending','running','paused','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`currentStepIndex` int NOT NULL DEFAULT 0,
	`totalSteps` int NOT NULL DEFAULT 1,
	`progressPercent` int NOT NULL DEFAULT 0,
	`activeAgent` varchar(64) NOT NULL DEFAULT 'Orchestrator',
	`currentAction` text,
	`summary` longtext,
	`error` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tool_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`toolName` varchar(64) NOT NULL,
	`category` varchar(32) NOT NULL,
	`permissionTier` enum('SAFE','CONFIRM','RESTRICTED') NOT NULL DEFAULT 'SAFE',
	`inputData` json,
	`outputData` json,
	`status` enum('pending_approval','running','success','failed') NOT NULL DEFAULT 'success',
	`durationMs` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_executions_id` PRIMARY KEY(`id`)
);
