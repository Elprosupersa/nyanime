from curl_cffi import requests
from bs4 import BeautifulSoup
import re
r = requests.get('https://www.az-animex.com/otonari-no-tenshi-sama-ni-itsunomanika-dame-ningen-ni-sareteita-ken/', impersonate='chrome110')
soup = BeautifulSoup(r.text, 'html.parser')
for a in soup.find_all('a'):
    href = a.get('href', '')
    if 'https://www.az-animex.com/' in href and href != 'https://www.az-animex.com/' and len(href) > 30:
        print(href)
