CREATE TABLE `genders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	CONSTRAINT `genders_id` PRIMARY KEY(`id`),
	CONSTRAINT `genders_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `marital_statuses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	CONSTRAINT `marital_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `marital_statuses_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`code` varchar(10),
	`address` varchar(200),
	`phone` varchar(10),
	`mobile` varchar(11),
	`skinColorId` int,
	`city` varchar(100),
	`state` varchar(100),
	`rg` varchar(100),
	`cpf` varchar(100),
	`birthDate` varchar(10),
	`birthPlace` varchar(100),
	`maritalStatusId` int,
	`genderId` int,
	`email` varchar(200),
	`referredBy` varchar(100),
	`registrationDate` varchar(10),
	`occupation` varchar(200),
	`additionalInfo1` varchar(200),
	`additionalInfo2` varchar(200),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phone_book` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(200),
	`occupation` varchar(200),
	`category` varchar(200),
	`phone` varchar(200),
	`observations` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phone_book_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skin_colors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	CONSTRAINT `skin_colors_id` PRIMARY KEY(`id`),
	CONSTRAINT `skin_colors_name_unique` UNIQUE(`name`)
);
