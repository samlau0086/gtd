import { randomUUID } from "node:crypto";
import { authError, requireUser } from "../../../_lib/auth";
import { bumpDataVersion, GtdError } from "../../../_lib/gtd";
import { withTransaction } from "../../../../../db/binding";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_TASK = 30;
type AttachmentRow = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id: taskId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new GtdError("请选择要上传的附件");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new GtdError("单个附件不能超过 20 MB");
    const fileName = (file.name || "未命名附件").slice(0, 240);
    const mimeType = (file.type || "application/octet-stream").slice(0, 160);
    const content = Buffer.from(await file.arrayBuffer());
    const result = await withTransaction(async (client) => {
      const task = await client.query("SELECT 1 FROM tasks WHERE id=$1 AND user_id=$2", [taskId, user.id]);
      if (!task.rowCount) throw new GtdError("任务不存在", 404);
      const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM task_attachments WHERE task_id=$1", [taskId]);
      if (Number(count.rows[0]?.count || 0) >= MAX_ATTACHMENTS_PER_TASK) throw new GtdError("每个任务最多上传 30 个附件");
      const id = randomUUID();
      const inserted = await client.query<AttachmentRow>(`INSERT INTO task_attachments(id,task_id,user_id,file_name,mime_type,size_bytes,content,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
        RETURNING id,file_name AS "fileName",mime_type AS "mimeType",size_bytes AS "sizeBytes",created_at AS "createdAt"`, [id, taskId, user.id, fileName, mimeType, file.size, content]);
      const dataVersion = await bumpDataVersion(client, user.id);
      return { record: { ...inserted.rows[0], sizeBytes: Number(inserted.rows[0].sizeBytes), createdAt: new Date(inserted.rows[0].createdAt).toISOString() }, dataVersion };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return authError(error);
  }
}
