#!/usr/bin/env python3
"""Static GenLayer schema guard for ClaimBot contracts.

This is a lightweight local check for the schema rules that commonly make
GenLayer Studio fail before deployment. It does not replace genvm-lint, but it
keeps the repository honest when the official tool is unavailable.
"""

from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path


FORBIDDEN_SCHEMA_TYPES = {"dict", "list", "int"}
FORBIDDEN_STORAGE_TYPES = {"dict", "list", "int"}
ALLOWED_UNTYPED_RETURNS = {"None"}


def dotted_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    if isinstance(node, ast.Subscript):
        return dotted_name(node.value)
    if isinstance(node, ast.Constant) and node.value is None:
        return "None"
    return ""


def is_gl_contract_base(node: ast.AST) -> bool:
    return dotted_name(node) == "gl.Contract"


def is_public_decorator(node: ast.AST) -> bool:
    name = dotted_name(node)
    return name in {"gl.public.view", "gl.public.write", "gl.public.write.payable"}


def annotation_root(annotation: ast.AST | None) -> str:
    if annotation is None:
        return ""
    return dotted_name(annotation)


def find_forbidden_annotation(annotation: ast.AST | None, forbidden: set[str]) -> str | None:
    if annotation is None:
        return "missing"

    root = annotation_root(annotation)
    if root in ALLOWED_UNTYPED_RETURNS:
        return None
    if root in forbidden:
        return root

    if isinstance(annotation, ast.Subscript):
        base = dotted_name(annotation.value)
        if base in forbidden:
            return base

    return None


def check_contract(path: Path) -> list[str]:
    source = path.read_text()
    errors: list[str] = []

    first_line = source.splitlines()[0] if source.splitlines() else ""
    if '"Depends": "py-genlayer:' not in first_line:
        errors.append("line 1: missing pinned py-genlayer dependency header")
    if "py-genlayer:test" in first_line or "py-genlayer:latest" in first_line:
        errors.append("line 1: py-genlayer runner must be pinned, not test/latest")

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [f"syntax error: {exc}"]

    contract_classes = [
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and any(is_gl_contract_base(base) for base in node.bases)
    ]
    if len(contract_classes) != 1:
        errors.append(f"expected exactly one gl.Contract subclass, found {len(contract_classes)}")
        return errors

    contract = contract_classes[0]

    for item in contract.body:
        if isinstance(item, ast.AnnAssign):
            bad_type = find_forbidden_annotation(item.annotation, FORBIDDEN_STORAGE_TYPES)
            if bad_type:
                target = getattr(item.target, "id", "<field>")
                errors.append(
                    f"line {item.lineno}: storage field {target!r} uses unsupported type {bad_type!r}"
                )

    for item in contract.body:
        if not isinstance(item, ast.FunctionDef):
            continue
        if not any(is_public_decorator(deco) for deco in item.decorator_list):
            continue

        for arg in item.args.args:
            if arg.arg == "self":
                continue
            bad_type = find_forbidden_annotation(arg.annotation, FORBIDDEN_SCHEMA_TYPES)
            if bad_type:
                errors.append(
                    f"line {arg.lineno}: public method {item.name}.{arg.arg} uses unsupported ABI type {bad_type!r}"
                )

        bad_return = find_forbidden_annotation(item.returns, FORBIDDEN_SCHEMA_TYPES)
        if bad_return:
            errors.append(
                f"line {item.lineno}: public method {item.name} returns unsupported ABI type {bad_return!r}"
            )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Check a GenLayer contract for Studio schema-safe shapes.")
    parser.add_argument("contract", type=Path)
    args = parser.parse_args()

    errors = check_contract(args.contract)
    if errors:
        print("GenLayer schema guard failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"GenLayer schema guard passed: {args.contract}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
