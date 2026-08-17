import { authError, requireUser } from "../../../../_lib/auth";
import { bumpDataVersion, GtdError } from "../../../../_lib/gtd";
import { query, withTransaction } from "../../../../../../db/binding";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser(request);
    const { id: taskId, attachmentId } = await params;
    const result = await query<{ file_name: string; mime_type: string; content: Buffer }>(`SELECT file_name,mime_type,content FROM task_attachments
      WHERE id=$1 AND task_id=$2 AND user_id=$3`, [attachmentId, taskId, user.id]);
    const attachment = result.rows[0];
    if (!attachment) throw new GtdError("附件不存在", 404);
    const inline = attachment.mime_type.startsWith("image/") || attachment.mime_type === "application/pdf";
    return new Response(new Uint8Array(attachment.content), {
      headers: {
        "Content-Type": attachment.mime_type,
        "Content-Length": String(attachment.content.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return authError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUser(request);
    const { id: taskId, attachmentId } = await params;
    return Response.json(await withTransaction(async (client) => {
      const deleted = await client.query("DELETE FROM task_attachments WHERE id=$1 AND task_id=$2 AND user_id=$3 RETURNING id", [attachmentId, taskId, user.id]);
      if (!deleted.rowCount) throw new GtdError("附件不存在", 404);
      return { dataVersion: await bumpDataVersion(client, user.id) };
    }));
  } catch (error) {
    return authError(error);
  }
}
