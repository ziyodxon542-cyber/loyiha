import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  try {
    // strong = yozilgan zahoti o'qiladi (kechikish bo'lmaydi)
    const meta = getStore({ name: "meta", consistency: "strong" });
    const imgs = getStore({ name: "images", consistency: "strong" });
    const path = new URL(req.url).pathname.replace(/^\/api\//, "");

    // Rasm fayli
    if (req.method === "GET" && path.startsWith("img/")) {
      const id = path.slice(4).replace(/[^a-z0-9-]/gi, "");
      const ab = await imgs.get(id, { type: "arrayBuffer" });
      if (!ab) return new Response("Rasm topilmadi", { status: 404 });
      let bytes = Buffer.from(ab);
      // eski (matn ko'rinishida saqlangan) rasmlar uchun moslik
      if (bytes.toString("latin1", 0, 4) === "/9j/") bytes = Buffer.from(bytes.toString("latin1"), "base64");
      return new Response(bytes, {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
      });
    }

    // Ro'yxat
    if (req.method === "GET" && path === "photos") {
      const { blobs } = await meta.list();
      const items = (await Promise.all(blobs.map((b) => meta.get(b.key, { type: "json" })))).filter(Boolean);
      items.sort((a, b) => b.createdAt - a.createdAt);
      return json(items.slice(0, 60));
    }

    // Yangi rasm
    if (req.method === "POST" && path === "photos") {
      const { src } = await req.json();
      const prefix = "data:image/jpeg;base64,";
      if (typeof src !== "string" || !src.startsWith(prefix) || src.length > 2_000_000)
        return new Response("Rasm noto'g'ri yoki katta", { status: 400 });
      const id = crypto.randomUUID();
      const buf = Buffer.from(src.slice(prefix.length), "base64");
      await imgs.set(id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const item = { id, likes: 0, createdAt: Date.now() };
      await meta.setJSON(id, item);
      return json(item);
    }

    // Like
    if (req.method === "POST" && path === "like") {
      const { id, delta } = await req.json();
      const safe = String(id).replace(/[^a-z0-9-]/gi, "");
      const item = await meta.get(safe, { type: "json" });
      if (!item) return new Response("Topilmadi", { status: 404 });
      item.likes = Math.max(0, item.likes + (delta === -1 ? -1 : 1));
      await meta.setJSON(safe, item);
      return json(item);
    }

    return new Response("Topilmadi", { status: 404 });
  } catch (e) {
    return new Response("Server xatosi: " + e.message, { status: 500 });
  }
};

export const config = { path: "/api/*" };
