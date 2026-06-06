import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolveTrackFile } from "@/lib/tracks.server";

/* ───────────────────────────────────────────
   오디오 스트리밍 (Range 지원)
   — .Music 원본을 public 으로 복사하지 않고 그대로 서빙.
     브라우저 시킹(탐색)은 Range 요청으로 동작하므로 206 필수.
   ─────────────────────────────────────────── */

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const file = await resolveTrackFile(id);
  if (!file) return new Response("Track not found", { status: 404 });

  const { filePath, size, contentType } = file;
  const base: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(null, {
        status: 416,
        headers: { ...base, "Content-Range": `bytes */${size}` },
      });
    }

    let start: number;
    let end: number;
    if (m[1] === "") {
      // suffix range — 마지막 N 바이트
      const n = Math.min(Number(m[2]), size);
      if (n === 0) {
        return new Response(null, {
          status: 416,
          headers: { ...base, "Content-Range": `bytes */${size}` },
        });
      }
      start = size - n;
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }

    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { ...base, "Content-Range": `bytes */${size}` },
      });
    }

    const stream = Readable.toWeb(
      createReadStream(filePath, { start, end })
    ) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(filePath)
  ) as unknown as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: { ...base, "Content-Length": String(size) },
  });
}
