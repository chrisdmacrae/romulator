# WEB specification

Currently this works via a CLI. I'd like a web based interface.

Phase 1:

The interface should work as follows:

- Use playwright to scrape the ROM list from the URL; start with a google style search page with "enter url". Default to https://myrient.erista.me/files/No-Intro/
    - Allow the user to pick from the list of ROM categories
    - Display the ROM list in a table
    - Allow the user to select which ROMs to download
    - Download the selected ROMs
    - Display the download progress
