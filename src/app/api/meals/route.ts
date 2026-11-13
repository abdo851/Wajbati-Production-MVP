import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import type { PublicMeal } from "@/lib/types";

function visibleMeal(meal: PublicMeal) {
  const row = meal as PublicMeal & { isDeleted?: boolean; isActive?: boolean };
  return row.isDeleted !== true && row.isActive !== false;
}

export async function GET() {
  return handle(async () => {
    try {
      const board = await getRepository().listTodayMeals();
      return NextResponse.json({
        serviceDate: board.serviceDate,
        meals: board.meals.filter(visibleMeal),
      });
    } catch (error) {
      console.error("MEALS", error instanceof Error ? error.message : "unknown");
      throw error;
    }
  });
}
