import requests
import os
from pathlib import Path
from typing import Optional


def sanitize_filename(filename: str) -> str:
    """
    Sanitize the filename while preserving as much of the original name as possible.
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename


def download_sql_snippets(
        access_token: str,
        project_ref: Optional[str] = None,
        output_dir: Optional[str] = None
) -> None:
    """
    Download SQL snippets from Supabase using the Management API.
    """
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    base_url = "https://api.supabase.com"
    params = {'project_ref': project_ref} if project_ref else {}
    snippets_url = f"{base_url}/v1/snippets"

    try:
        # Get list of all snippets
        response = requests.get(snippets_url, headers=headers, params=params)
        response.raise_for_status()
        snippets = response.json().get('data', [])

        if not snippets:
            print("No SQL snippets found")
            return

        output_dir = output_dir or "./sql_snippets"
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        used_names = set()

        for i, snippet in enumerate(snippets, 1):
            snippet_id = snippet.get('id')
            name = snippet.get('name')

            if not snippet_id:
                continue

            snippet_url = f"{snippets_url}/{snippet_id}"
            print(f"Fetching snippet {i}/{len(snippets)}: {name or snippet_id}")

            # Get the detailed snippet
            snippet_response = requests.get(snippet_url, headers=headers, params=params)
            snippet_response.raise_for_status()
            full_snippet = snippet_response.json()

            # Use name from either response
            name = name or full_snippet.get('name')
            if not name:
                filename = f"snippet_{snippet_id}.sql"
            else:
                filename = name if name.lower().endswith('.sql') else f"{name}.sql"
                filename = sanitize_filename(filename)

            # Handle duplicate filenames
            base_filename = filename
            counter = 1
            while filename in used_names:
                name_parts = base_filename.rsplit('.', 1)
                filename = f"{name_parts[0]}_{counter}.{name_parts[1]}"
                counter += 1
            used_names.add(filename)

            filepath = Path(output_dir) / filename

            # Get the SQL content from the correct nested structure
            content_obj = full_snippet.get('content', {})
            sql_content = content_obj.get('sql', '')

            if not sql_content:
                print(f"Warning: No SQL content found for {filename}")
                continue

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(sql_content)

            print(f"Saved: {filename}")

        print(f"\nSuccessfully downloaded {len(snippets)} SQL snippets to {output_dir}")

    except requests.exceptions.RequestException as e:
        print(f"\nError accessing Supabase API:")
        print(f"- Error type: {type(e).__name__}")
        print(f"- Error message: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"- Status code: {e.response.status_code}")
            print(f"- Response body: {e.response.text}")
    except Exception as e:
        print(f"Unexpected error: {e}")


if __name__ == "__main__":
    print("Supabase SQL Snippet Downloader")
    print("-" * 30)

    access_token = os.getenv("SUPABASE_ACCESS_TOKEN") or input("Enter your Supabase access token (sbp_...): ").strip()
    project_ref = os.getenv("SUPABASE_PROJECT_REF") or input(
        "Enter your project reference ID (optional, press Enter to skip): ").strip() or None
    output_dir = input("Enter output directory (press Enter for default): ").strip() or None

    download_sql_snippets(access_token, project_ref, output_dir)