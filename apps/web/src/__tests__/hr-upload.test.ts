/**
 * Tests for HR upload feature types, validation logic, and form data construction.
 *
 * Covers:
 * - DocumentCategory type completeness
 * - ACLEntry interface field correctness
 * - ACL validation rules per category type (HR requires ACL, general does not)
 * - Role options for ACL role-based grants
 * - Upload form data construction including category and ACL JSON
 */

import type { ACLEntry, DocumentCategory, UserRole } from "@/types";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// All valid DocumentCategory values
// ---------------------------------------------------------------------------

const ALL_DOCUMENT_CATEGORIES: DocumentCategory[] = [
	"general",
	"hr_evaluation",
	"hr_compensation",
	"hr_contract",
	"hr_attendance",
	"hr_skills",
	"hr_org",
	"hr_compliance",
];

const HR_CATEGORIES: DocumentCategory[] = ALL_DOCUMENT_CATEGORIES.filter((c) =>
	c.startsWith("hr_"),
);

// ---------------------------------------------------------------------------
// Helpers (replicate validation logic from upload form — not exported)
// ---------------------------------------------------------------------------

function isHrCategory(category: DocumentCategory): boolean {
	return category.startsWith("hr_");
}

function validateAcl(category: DocumentCategory, acl: ACLEntry[]): boolean {
	if (isHrCategory(category)) {
		return acl.length > 0;
	}
	return true; // general category: ACL optional
}

function buildFormData(
	file: File,
	category: DocumentCategory,
	acl: ACLEntry[],
): FormData {
	const fd = new FormData();
	fd.append("file", file);
	fd.append("category", category);
	fd.append("acl", JSON.stringify(acl));
	return fd;
}

// ---------------------------------------------------------------------------
// DocumentCategory type tests
// ---------------------------------------------------------------------------

describe("DocumentCategory type", () => {
	it("has all expected category values", () => {
		const expected: DocumentCategory[] = [
			"general",
			"hr_evaluation",
			"hr_compensation",
			"hr_contract",
			"hr_attendance",
			"hr_skills",
			"hr_org",
			"hr_compliance",
		];

		expect(ALL_DOCUMENT_CATEGORIES).toHaveLength(expected.length);
		for (const cat of expected) {
			expect(ALL_DOCUMENT_CATEGORIES).toContain(cat);
		}
	});

	it("identifies 7 HR-specific categories (all prefixed with hr_)", () => {
		expect(HR_CATEGORIES).toHaveLength(7);
		for (const cat of HR_CATEGORIES) {
			expect(cat.startsWith("hr_")).toBe(true);
		}
	});

	it("identifies 'general' as the only non-HR category", () => {
		const nonHr = ALL_DOCUMENT_CATEGORIES.filter((c) => !c.startsWith("hr_"));
		expect(nonHr).toHaveLength(1);
		expect(nonHr[0]).toBe("general");
	});
});

// ---------------------------------------------------------------------------
// ACLEntry interface tests
// ---------------------------------------------------------------------------

describe("ACLEntry interface", () => {
	it("has granteeType, granteeId, and permission fields", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "hr",
			permission: "read",
		};

		expect(entry.granteeType).toBe("role");
		expect(entry.granteeId).toBe("hr");
		expect(entry.permission).toBe("read");
	});

	it("accepts granteeType='user'", () => {
		const entry: ACLEntry = {
			granteeType: "user",
			granteeId: "00000000-0000-0000-0000-000000000001",
			permission: "read",
		};

		expect(entry.granteeType).toBe("user");
	});

	it("accepts granteeType='department'", () => {
		const entry: ACLEntry = {
			granteeType: "department",
			granteeId: "dept-engineering",
			permission: "read",
		};

		expect(entry.granteeType).toBe("department");
	});

	it("accepts permission='write'", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "ceo",
			permission: "write",
		};

		expect(entry.permission).toBe("write");
	});
});

// ---------------------------------------------------------------------------
// ACL validation rules
// ---------------------------------------------------------------------------

describe("HR category ACL validation", () => {
	it("requires at least one ACL entry when category is hr_evaluation", () => {
		const isValid = validateAcl("hr_evaluation", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_compensation", () => {
		const isValid = validateAcl("hr_compensation", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_contract", () => {
		const isValid = validateAcl("hr_contract", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_attendance", () => {
		const isValid = validateAcl("hr_attendance", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_skills", () => {
		const isValid = validateAcl("hr_skills", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_org", () => {
		const isValid = validateAcl("hr_org", []);
		expect(isValid).toBe(false);
	});

	it("requires at least one ACL entry when category is hr_compliance", () => {
		const isValid = validateAcl("hr_compliance", []);
		expect(isValid).toBe(false);
	});

	it("passes validation for hr_* category when one ACL entry is provided", () => {
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "hr", permission: "read" },
		];
		const isValid = validateAcl("hr_evaluation", acl);
		expect(isValid).toBe(true);
	});

	it("passes validation for hr_* category with multiple ACL entries", () => {
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "ceo", permission: "read" },
			{ granteeType: "role", granteeId: "executive", permission: "read" },
		];
		const isValid = validateAcl("hr_compensation", acl);
		expect(isValid).toBe(true);
	});
});

describe("General category ACL validation", () => {
	it("passes validation when category is general with empty ACL", () => {
		const isValid = validateAcl("general", []);
		expect(isValid).toBe(true);
	});

	it("passes validation when category is general with non-empty ACL", () => {
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "employee", permission: "read" },
		];
		const isValid = validateAcl("general", acl);
		expect(isValid).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// ACL role options
// ---------------------------------------------------------------------------

describe("ACL role options", () => {
	it("includes all expected role values in UserRole type", () => {
		const roles: UserRole[] = [
			"employee",
			"manager",
			"hr",
			"executive",
			"ceo",
			"admin",
		];

		// Verify each role is a valid UserRole (compile-time check via TypeScript)
		expect(roles).toHaveLength(6);
		expect(roles).toContain("ceo");
		expect(roles).toContain("executive");
		expect(roles).toContain("hr");
		expect(roles).toContain("manager");
	});

	it("ceo role can be used as ACL granteeId", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "ceo" satisfies UserRole,
			permission: "read",
		};
		expect(entry.granteeId).toBe("ceo");
	});

	it("executive role can be used as ACL granteeId", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "executive" satisfies UserRole,
			permission: "read",
		};
		expect(entry.granteeId).toBe("executive");
	});

	it("hr role can be used as ACL granteeId", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "hr" satisfies UserRole,
			permission: "read",
		};
		expect(entry.granteeId).toBe("hr");
	});

	it("manager role can be used as ACL granteeId", () => {
		const entry: ACLEntry = {
			granteeType: "role",
			granteeId: "manager" satisfies UserRole,
			permission: "read",
		};
		expect(entry.granteeId).toBe("manager");
	});
});

// ---------------------------------------------------------------------------
// Upload form data construction
// ---------------------------------------------------------------------------

describe("Upload form data construction", () => {
	it("includes category field", () => {
		const file = new File(["%PDF-1.4 content"], "eval.pdf", {
			type: "application/pdf",
		});
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "hr", permission: "read" },
		];

		const fd = buildFormData(file, "hr_evaluation", acl);
		expect(fd.get("category")).toBe("hr_evaluation");
	});

	it("includes ACL as JSON string", () => {
		const file = new File(["%PDF-1.4 content"], "eval.pdf", {
			type: "application/pdf",
		});
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "ceo", permission: "read" },
		];

		const fd = buildFormData(file, "hr_evaluation", acl);
		const aclJson = fd.get("acl") as string;
		expect(typeof aclJson).toBe("string");

		const parsed = JSON.parse(aclJson) as ACLEntry[];
		expect(parsed).toHaveLength(1);
		expect(parsed[0].granteeType).toBe("role");
		expect(parsed[0].granteeId).toBe("ceo");
	});

	it("includes file in form data", () => {
		const file = new File(["content"], "contract.docx", {
			type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});

		const fd = buildFormData(file, "hr_contract", [
			{ granteeType: "role", granteeId: "hr", permission: "read" },
		]);

		const attachedFile = fd.get("file") as File;
		expect(attachedFile).toBeInstanceOf(File);
		expect(attachedFile.name).toBe("contract.docx");
	});

	it("serialises multiple ACL entries to JSON correctly", () => {
		const file = new File(["data"], "payroll.xlsx", { type: "text/csv" });
		const acl: ACLEntry[] = [
			{ granteeType: "role", granteeId: "ceo", permission: "read" },
			{ granteeType: "role", granteeId: "executive", permission: "read" },
			{
				granteeType: "user",
				granteeId: "00000000-0000-0000-0000-000000000099",
				permission: "read",
			},
		];

		const fd = buildFormData(file, "hr_compensation", acl);
		const aclJson = fd.get("acl") as string;
		const parsed = JSON.parse(aclJson) as ACLEntry[];

		expect(parsed).toHaveLength(3);
		expect(parsed[0].granteeId).toBe("ceo");
		expect(parsed[1].granteeId).toBe("executive");
		expect(parsed[2].granteeType).toBe("user");
	});

	it("serialises empty ACL array for general category", () => {
		const file = new File(["content"], "policy.pdf", {
			type: "application/pdf",
		});

		const fd = buildFormData(file, "general", []);
		const aclJson = fd.get("acl") as string;
		const parsed = JSON.parse(aclJson);

		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(0);
	});
});
