ALTER TABLE `patients`
ADD CONSTRAINT `patients_cpf_unique` UNIQUE (`cpf`);
