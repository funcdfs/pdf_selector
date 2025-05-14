#!/bin/bash

# Strict mode
set -euo pipefail

# --- Configuration ---
MAIN_BRANCH="main" # Or your primary development branch, e.g., "master"
# RELEASE_BRANCH_PREFIX="release/v" # No longer creating a separate release branch
REMOTE_NAME="origin"

# --- Helper Functions ---
info() {
    echo -e "\\033[1;34m[INFO]\\033[0m $1"
}

error() {
    echo -e "\\033[1;31m[ERROR]\\033[0m $1" >&2
    exit 1
}

warning() {
    echo -e "\\033[1;33m[WARN]\\033[0m $1"
}

# --- Pre-flight Checks ---
info "Running pre-flight checks..."

# 1. Check if Git is installed
if ! command -v git &> /dev/null; then
    error "Git is not installed. Please install Git to continue."
fi

# 2. Check if currently in a Git repository
if ! git rev-parse --is-inside-work-tree &> /dev/null; then
    error "Not inside a Git repository. Please run this script from the root of your project."
fi

# 3. Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    warning "You have uncommitted changes. It's recommended to commit or stash them before proceeding."
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo # Move to a new line
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Aborting release process."
        exit 0
    fi
fi

# --- Release Process ---
info "Starting the release process..."

# 1. Switch to the main branch and pull latest changes
info "Switching to '$MAIN_BRANCH' branch and pulling latest changes..."
if ! git checkout "$MAIN_BRANCH"; then
    error "Failed to switch to branch '$MAIN_BRANCH'."
fi
if ! git pull "$REMOTE_NAME" "$MAIN_BRANCH"; then
    error "Failed to pull latest changes from '$REMOTE_NAME/$MAIN_BRANCH'."
fi

# 2. Get the current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
if [ -z "$CURRENT_VERSION" ]; then
    error "Could not retrieve current version from package.json."
fi
info "Current version: $CURRENT_VERSION"

# Calculate the suggested next version (increment patch number)
calculate_next_version() {
    local version=$1
    # Extract major, minor, patch, and possible pre-release/build parts
    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(.*)$ ]]; then
        local major="${BASH_REMATCH[1]}"
        local minor="${BASH_REMATCH[2]}"
        local patch="${BASH_REMATCH[3]}"
        local suffix="${BASH_REMATCH[4]}"
        
        # Increment patch version
        local new_patch=$((patch + 1))
        echo "${major}.${minor}.${new_patch}${suffix}"
    else
        # If version doesn't match expected format, just return it unchanged
        echo "$version"
    fi
}

SUGGESTED_VERSION=$(calculate_next_version "$CURRENT_VERSION")

# 3. Ask for the new version, suggesting the next patch version
read -p "Enter the new version [press Enter for $SUGGESTED_VERSION]: " NEW_VERSION

# If user just pressed Enter, use the suggested version
if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION="$SUGGESTED_VERSION"
    info "Using suggested version: $NEW_VERSION"
fi

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
    error "Invalid version format. Please use semantic versioning (e.g., 1.2.3, 1.2.3-beta.1)."
fi

if [ "$NEW_VERSION" == "$CURRENT_VERSION" ]; then
    warning "New version is the same as the current version. No version bump will occur."
    read -p "Do you want to continue with version $NEW_VERSION? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Aborting release process."
        exit 0
    fi
fi

info "Updating version in package.json to $NEW_VERSION..."
# Use npm version to update package.json, package-lock.json, and create a git tag
# Using --no-git-tag-version because we will create an annotated tag later
if ! npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version; then
    error "Failed to update version using npm version. Check for errors above."
fi
# Verify the version was updated
ACTUAL_NEW_VERSION=$(node -p "require('./package.json').version")
if [ "$ACTUAL_NEW_VERSION" != "$NEW_VERSION" ]; then
    error "Failed to update package.json. Expected $NEW_VERSION but found $ACTUAL_NEW_VERSION."
fi


# 4. Commit the version bump directly to the main branch
info "Committing version bump for v$NEW_VERSION on branch '$MAIN_BRANCH'..."
# The `npm version` command already modified package.json and potentially package-lock.json.
# We use `git add` to be explicit, then commit.
if [ -f package-lock.json ]; then
  git add package.json package-lock.json
else
  git add package.json
fi

if ! git commit -m "chore(release): v$NEW_VERSION"; then
    error "Failed to commit version bump to '$MAIN_BRANCH'."
fi

# 5. Create an annotated Git tag
TAG_NAME="v$NEW_VERSION"
info "Creating annotated tag '$TAG_NAME'..."
if ! git tag -a "$TAG_NAME" -m "Release $TAG_NAME"; then
    error "Failed to create tag '$TAG_NAME'."
fi

# 6. Push the main branch and the tag
info "Pushing branch '$MAIN_BRANCH' and tag '$TAG_NAME' to '$REMOTE_NAME'..."
if ! git push "$REMOTE_NAME" "$MAIN_BRANCH"; then
    error "Failed to push branch '$MAIN_BRANCH' to '$REMOTE_NAME'."
fi
if ! git push "$REMOTE_NAME" "$TAG_NAME"; then
    error "Failed to push tag '$TAG_NAME' to '$REMOTE_NAME'."
fi

info "---------------------------------------------------------------------"
info "Release v$NEW_VERSION complete!"
info "Committed to '$MAIN_BRANCH', created tag '$TAG_NAME', and pushed both to remote."
info "The GitHub Actions workflow should now trigger to build and release."
info "---------------------------------------------------------------------"

exit 0 