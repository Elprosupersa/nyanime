import sys
from bs4 import BeautifulSoup
import requests
import re

url = "https://jkanime.net/youjo-senki-movie/1/"
headers = {"User-Agent": "Mozilla/5.0"}
r = requests.get(url, headers=headers)
soup = BeautifulSoup(r.text, "html.parser")

for a in soup.find_all("a"):
    txt = a.get_text(strip=True)
    href = a.get("href", "")
    if any(k in href for k in ["mega", "mediafire", "desu", "stream", "solidfiles", "1fichier"]) or "Descargar" in txt:
        print(f"{txt} -> {href}")

matches = re.findall(r"https://[^\s\"\'\<\>]+", r.text)
for m in set(matches):
    if any(k in m for k in ["mediafire.com", "mega.nz", "streamtape", "voe.sx", "yourupload"]):
        print("Matched direct provider:", m)
