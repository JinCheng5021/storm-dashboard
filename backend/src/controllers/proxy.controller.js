export async function proxyImage(req, res, next) {
  try {
    const { url } = req.query;
    if (!url || !url.startsWith("https://www.gdacs.org")) {
      return res.status(400).send("Invalid image URL");
    }

    const imageRes = await fetch(url, {
      headers: {
        // Giả lập như một trình duyệt thông thường
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!imageRes.ok) {
      return res.status(imageRes.status).send("Failed to fetch image");
    }

    const contentType = imageRes.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      return res.status(404).send("Image not found");
    }
    
    res.setHeader("Content-Type", contentType);
    const arrayBuffer = await imageRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    next(error);
  }
}
