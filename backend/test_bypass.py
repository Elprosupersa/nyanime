import cloudscraper
from curl_cffi import requests

url = "https://fukou-da.net/?s=otonari"

print("--- Testing Cloudscraper ---")
try:
    scraper = cloudscraper.create_scraper()
    r = scraper.get(url, timeout=10)
    print("Status:", r.status_code)
    if "Cloudflare" not in r.text and "404 Not Found" not in r.text:
        print("Cloudscraper works!")
    else:
        print("Cloudscraper blocked.")
except Exception as e:
    print("Cloudscraper error:", e)

print("--- Testing curl_cffi ---")
try:
    r2 = requests.get(url, impersonate="chrome110", timeout=10)
    print("Status:", r2.status_code)
    if "Cloudflare" not in r2.text and "404 Not Found" not in r2.text:
        print("curl_cffi works!")
    else:
        print("curl_cffi blocked.")
except Exception as e:
    print("curl_cffi error:", e)
