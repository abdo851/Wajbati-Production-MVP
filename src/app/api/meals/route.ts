import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const board = await getRepository().listTodayMeals();
    return NextResponse.json({
      serviceDate: board.serviceDate,
      meals: board.meals.filter((meal) => meal.serviceDate === board.serviceDate),
    });
  });
}
