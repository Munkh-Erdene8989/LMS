-- Ticket 17: сунгалтын өмнөх сануулга. Сануулга илгээсэн үеийн төгсгөлийг хадгалж үе бүрт нэг л удаа илгээнэ.
ALTER TABLE "subscriptions" ADD COLUMN "renewal_reminded_for" TIMESTAMP(3);
