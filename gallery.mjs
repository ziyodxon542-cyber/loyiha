import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  const meta = getStore("meta");
  const imgs = getStore("images");
  const path = new URL(req.url).pathname.replace(/^\/api\//, "");

  // Rasm fayli
  if (req.method === "GET" && path.startsWith("img/")) {
    const id = path.slice(4).replace(/[^a-z0-9-]/gi, "");
    const data = await imgs.get(id);
    if (!data) return new Response("Topilmadi", { status: 404 });
    return new Response(Buffer.from(data, "base64"), {
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
    await imgs.set(id, src.slice(prefix.length));
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
};

export const config = { path: "/api/*" };
