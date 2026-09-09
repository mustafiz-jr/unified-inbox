import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import apiClient from '@/lib/axios';

export interface User {
    id: number;
    name: string;
    email: string;
}

interface UserState {
    users: User[];
    loading: boolean;
    error: string | null;
}

export const fetchUsers = createAsyncThunk<User[], void>(
    'users/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const response = await apiClient.get('/users');
            const data = response.data;
            if (Array.isArray(data)) {
                return data;
            } else if (data && Array.isArray(data.data)) {
                return data.data;
            } else {
                throw new Error('Unexpected API response format');
            }
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Failed to fetch users';
            return rejectWithValue(message);
        }
    }
);

export const createUser = createAsyncThunk<User, Omit<User, 'id'>>(
    'users/create',
    async (userData, { rejectWithValue }) => {
        try {
            const response = await apiClient.post('/users', userData);
            return response.data.data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Failed to create user';
            return rejectWithValue(message);
        }
    }
);

export const updateUser = createAsyncThunk<User, { id: number; userData: Partial<Omit<User, 'id'>> }>(
    'users/update',
    async ({ id, userData }, { rejectWithValue }) => {
        try {
            const response = await apiClient.put(`/users/${id}`, userData);
            return response.data.data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Failed to update user';
            return rejectWithValue(message);
        }
    }
);

export const deleteUser = createAsyncThunk<number, number>(
    'users/delete',
    async (id, { rejectWithValue }) => {
        try {
            await apiClient.delete(`/users/${id}`);
            return id;
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Failed to delete user';
            return rejectWithValue(message);
        }
    }
);

const initialState: UserState = {
    users: [],
    loading: false,
    error: null,
};

const userSlice = createSlice({
    name: 'users',
    initialState,
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchUsers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchUsers.fulfilled, (state, action: PayloadAction<User[]>) => {
                state.loading = false;
                state.users = action.payload;
            })
            .addCase(fetchUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string || 'Failed to fetch users';
            })
            .addCase(createUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(createUser.fulfilled, (state, action: PayloadAction<User>) => {
                state.loading = false;
                state.users.push(action.payload);
            })
            .addCase(createUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string || 'Failed to create user';
            })
            .addCase(updateUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(updateUser.fulfilled, (state, action: PayloadAction<User>) => {
                state.loading = false;
                const index = state.users.findIndex((user) => user.id === action.payload.id);
                if (index !== -1) {
                    state.users[index] = action.payload;
                }
            })
            .addCase(updateUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string || 'Failed to update user';
            })
            .addCase(deleteUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(deleteUser.fulfilled, (state, action: PayloadAction<number>) => {
                state.loading = false;
                state.users = state.users.filter((user) => user.id !== action.payload);
            })
            .addCase(deleteUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string || 'Failed to delete user';
            });
    },
});

export const { clearError } = userSlice.actions;
export default userSlice.reducer;