ALTER TABLE "investigations" DROP CONSTRAINT "investigations_href_unique";--> statement-breakpoint
DROP INDEX "cases_updated_idx";--> statement-breakpoint
DROP INDEX "investigations_opened_idx";--> statement-breakpoint
DROP INDEX "reports_updated_idx";--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "owner_id" bigint;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "owner_id" bigint;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "owner_id" bigint;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_owner_updated_idx" ON "cases" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "investigations_owner_opened_idx" ON "investigations" USING btree ("owner_id","opened_at");--> statement-breakpoint
CREATE INDEX "reports_owner_updated_idx" ON "reports" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_owner_href_unique" UNIQUE("owner_id","href");