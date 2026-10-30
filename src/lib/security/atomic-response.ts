import mongoose from "mongoose";
import connect from "@/lib/mongoose";
import { prepareMutationLock, acquireMutationLock } from "./mutation-lock";
class AbortResponse extends Error {
  constructor(public response: Response) {
    super("Operation rejected");
  }
}
/** Roll back even when an existing route returns an error Response instead of throwing. */
export async function atomicResponse(run: () => Promise<Response>) {
  try {
    await connect();
    await prepareMutationLock();
    return await mongoose.connection.transaction(async () => {
      await acquireMutationLock();
      const response = await run();
      if (!response.ok) throw new AbortResponse(response);
      return response;
    });
  } catch (err) {
    if (err instanceof AbortResponse) return err.response;
    console.error("[Atomic operation]", {
      error: err instanceof Error ? err.name : "Unknown",
    });
    return Response.json(
      {
        success: false,
        error:
          "No se guardó la operación. Revisa los datos y vuelve a intentarlo.",
      },
      { status: 409 },
    );
  }
}
