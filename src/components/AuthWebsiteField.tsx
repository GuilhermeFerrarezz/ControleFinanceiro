// Kept out of keyboard navigation, autofill and the accessibility tree.
export default function AuthWebsiteField() {
  return <label hidden aria-hidden="true">Site
    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
  </label>;
}
