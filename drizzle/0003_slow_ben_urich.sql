ALTER TABLE `patients` MODIFY COLUMN `code` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` ADD CONSTRAINT `patients_code_unique` UNIQUE(`code`);