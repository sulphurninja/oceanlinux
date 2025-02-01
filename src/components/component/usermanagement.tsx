"use client";

import { useState, ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

interface User {
  id: number;
  name: string;
  email: string;
}

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<keyof User>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [usersPerPage, setUsersPerPage] = useState<number>(10);

  const users: User[] = [
    { id: 1, name: "John Doe", email: "john@example.com" },
    { id: 2, name: "Jane Smith", email: "jane@example.com" },
    { id: 3, name: "Bob Johnson", email: "bob@example.com" },
    { id: 4, name: "Alice Williams", email: "alice@example.com" },
    { id: 5, name: "Tom Davis", email: "tom@example.com" },
    { id: 6, name: "Sarah Lee", email: "sarah@example.com" },
    { id: 7, name: "Michael Brown", email: "michael@example.com" },
    { id: 8, name: "Emily Wilson", email: "emily@example.com" },
    { id: 9, name: "David Anderson", email: "david@example.com" },
    { id: 10, name: "Olivia Thompson", email: "olivia@example.com" },
    { id: 11, name: "Christopher Martinez", email: "christopher@example.com" },
    { id: 12, name: "Sophia Hernandez", email: "sophia@example.com" },
    { id: 13, name: "Daniel Gonzalez", email: "daniel@example.com" },
    { id: 14, name: "Isabella Ramirez", email: "isabella@example.com" },
    { id: 15, name: "Matthew Diaz", email: "matthew@example.com" },
  ];

  const filteredUsers = users.filter((user) => user.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const sortedUsers = filteredUsers.sort((a, b) => {
    if (a[sortColumn] < b[sortColumn]) return sortDirection === "asc" ? -1 : 1;
    if (a[sortColumn] > b[sortColumn]) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = sortedUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleSort = (column: keyof User) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="w-full h-screen bg-background flex flex-col justify-center items-center px-8 sm:px-12 lg:px-16 py-12 space-y-8">
      <div className="flex items-center justify-between mb-8 w-full max-w-6xl">
        <h1 className="text-2xl font-bold">User Management</h1>
        <div className="flex items-center gap-4">
          <Input
            type="search"
            placeholder="Search users..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full max-w-xs"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <FilterIcon className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* <DropdownMenuRadioGroup value={sortColumn} onValueChange={(value: keyof User) => handleSort(value)}> */}
                {/* <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem> */}
                {/* <DropdownMenuRadioItem value="email">Email</DropdownMenuRadioItem> */}
              {/* </DropdownMenuRadioGroup> */}
              <DropdownMenuSeparator />
              {/* <DropdownMenuRadioGroup
                value={sortDirection}
                onValueChange={(value: "asc" | "desc") => setSortDirection(value)}
              > */}
                {/* <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup> */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="overflow-x-auto w-full max-w-6xl">
        <Table className="mt-8 w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer space-x-2" onClick={() => handleSort("name")}>
                <span>Name</span>
                {sortColumn === "name" && <span className="ml-2">{sortDirection === "asc" ? "\u25B2" : "\u25BC"}</span>}
              </TableHead>
              <TableHead className="cursor-pointer space-x-2" onClick={() => handleSort("email")}>
                <span>Email</span>
                {sortColumn === "email" && (
                  <span className="ml-2">{sortDirection === "asc" ? "\u25B2" : "\u25BC"}</span>
                )}
              </TableHead>
              <TableHead className="text-right space-x-2">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="space-y-4">
            {currentUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium space-x-2">{user.name}</TableCell>
                <TableCell className="space-x-2">{user.email}</TableCell>
                <TableCell className="text-right space-x-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <DotIcon className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between w-full max-w-6xl">
        <div className="text-sm text-muted-foreground space-x-2">
          <span>Showing</span>
          <span>{indexOfFirstUser + 1}</span>
          <span>to</span>
          <span>{indexOfLastUser}</span>
          <span>of</span>
          <span>{filteredUsers.length}</span>
          <span>users</span>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="space-x-2"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            <span>Previous</span>
          </Button>
          {/* <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} /> */}
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="space-x-2"
          >
            <span>Next</span>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChevronLeftIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function DotIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12.1" cy="12.1" r="1" />
    </svg>
  );
}

function FilterIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function XIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
